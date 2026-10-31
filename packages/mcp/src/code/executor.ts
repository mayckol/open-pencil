import { getQuickJS, shouldInterruptAfterDeadline } from 'quickjs-emscripten'
import type { QuickJSContext, QuickJSDeferredPromise, QuickJSHandle } from 'quickjs-emscripten'

/**
 * Runs a host tool from sandboxed code. Arguments and the answer cross the boundary as JSON
 * text, so no host object or function ever reaches the sandbox.
 */
export type CodeHostCall = (name: string, argsJSON: string) => Promise<unknown>

/** The shape Cloudflare Code Mode executors return, so another sandbox can replace QuickJS. */
export interface CodeExecuteResult {
  result: unknown
  error?: string
  logs: string[]
}

export interface CodeExecutor {
  execute(code: string, call: CodeHostCall): Promise<CodeExecuteResult>
}

export interface QuickJSExecutorOptions {
  timeoutMs?: number
  memoryLimitBytes?: number
}

const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_MEMORY_LIMIT_BYTES = 64 * 1024 * 1024
const MAX_STACK_BYTES = 1024 * 1024

// Tools resolve to `{ value }` or `{ error }` so a failed tool throws inside the script, where
// `try`/`catch` can handle it. The script runs as an async function body, as `eval` does.
function sandboxSource(code: string): string {
  return `
const openpencil = new Proxy({}, {
  get(_, name) {
    if (typeof name !== 'string' || name === 'then') return undefined
    return async (args = {}) => {
      const answer = JSON.parse(await __call(name, JSON.stringify(args)))
      if ('error' in answer) throw new Error(answer.error)
      return answer.value
    }
  }
})
const __format = (values) => values
  .map((value) => typeof value === 'string' ? value : JSON.stringify(value))
  .join(' ')
const console = {
  log: (...values) => __log(__format(values)),
  info: (...values) => __log(__format(values)),
  warn: (...values) => __log(__format(values)),
  error: (...values) => __log(__format(values))
}
;(async () => {
${code}
})().then(
  (value) => __done(value === undefined ? 'null' : JSON.stringify(value)),
  (error) => __fail(error instanceof Error ? \`\${error.name}: \${error.message}\n\${error.stack}\` : String(error))
)
`
}

/** A QuickJS (WebAssembly) sandbox: no Node APIs, filesystem, network, or host globals. */
export function createQuickJSExecutor(options: QuickJSExecutorOptions = {}): CodeExecutor {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const memoryLimitBytes = options.memoryLimitBytes ?? DEFAULT_MEMORY_LIMIT_BYTES

  return {
    async execute(code, call) {
      const QuickJS = await getQuickJS()
      const runtime = QuickJS.newRuntime()
      runtime.setMemoryLimit(memoryLimitBytes)
      runtime.setMaxStackSize(MAX_STACK_BYTES)
      runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + timeoutMs))
      const context = runtime.newContext()
      const logs: string[] = []
      const pending = new Set<QuickJSDeferredPromise>()
      let disposed = false

      let settle: (outcome: { result: unknown; error?: string }) => void = () => undefined
      const outcome = new Promise<{ result: unknown; error?: string }>((resolve) => {
        settle = resolve
      })

      const runJobs = () => {
        if (disposed) return
        const jobs = runtime.executePendingJobs()
        if (jobs.error) {
          settle({ result: null, error: describeError(context, jobs.error) })
          jobs.error.dispose()
        }
      }

      const defineGlobal = (
        name: string,
        fn: (...args: QuickJSHandle[]) => QuickJSHandle | undefined
      ) => {
        const handle = context.newFunction(name, fn)
        context.setProp(context.global, name, handle)
        handle.dispose()
      }

      defineGlobal('__log', (message) => {
        logs.push(context.getString(message))
        return undefined
      })
      defineGlobal('__done', (json) => {
        settle({ result: JSON.parse(context.getString(json)) as unknown })
        return undefined
      })
      defineGlobal('__fail', (message) => {
        settle({ result: null, error: context.getString(message) })
        return undefined
      })
      defineGlobal('__call', (nameHandle, argsHandle) => {
        const deferred = context.newPromise()
        pending.add(deferred)
        const name = context.getString(nameHandle)
        const argsJSON = context.getString(argsHandle)
        const answer = async () => {
          try {
            return { value: await call(name, argsJSON) }
          } catch (error) {
            return { error: error instanceof Error ? error.message : String(error) }
          }
        }
        void answer().then((settled) => {
          if (disposed) return false
          const text = context.newString(JSON.stringify(settled))
          deferred.resolve(text)
          text.dispose()
          pending.delete(deferred)
          deferred.dispose()
          runJobs()
          return true
        })
        return deferred.handle
      })

      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const evaluated = context.evalCode(sandboxSource(code), 'execute.js')
        if (evaluated.error) {
          settle({ result: null, error: describeError(context, evaluated.error) })
          evaluated.error.dispose()
        } else {
          evaluated.value.dispose()
          runJobs()
        }
        const timeout = new Promise<{ result: unknown; error: string }>((resolve) => {
          timer = setTimeout(
            () => resolve({ result: null, error: `Execution timed out after ${timeoutMs} ms` }),
            timeoutMs
          )
        })
        return { ...(await Promise.race([outcome, timeout])), logs }
      } finally {
        clearTimeout(timer)
        disposed = true
        for (const deferred of pending) deferred.dispose()
        context.dispose()
        runtime.dispose()
      }
    }
  }
}

function describeError(context: QuickJSContext, handle: QuickJSHandle): string {
  const error: unknown = context.dump(handle)
  if (error && typeof error === 'object' && 'message' in error) {
    const { message, stack } = error as { message: unknown; stack?: unknown }
    return typeof stack === 'string' && stack ? `${String(message)}\n${stack}` : String(message)
  }
  return String(error)
}
