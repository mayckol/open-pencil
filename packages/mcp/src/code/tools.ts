import type { CallToolResult, McpServer, ServerContext } from '@modelcontextprotocol/server'
// eslint-disable-next-line open-pencil/no-mixed-case-acronym-identifiers -- Upstream export spelling.
import {
  toJsonSchema as toJSONSchema,
  toStandardJsonSchema as toStandardJSONSchema
} from '@valibot/to-json-schema'
import * as v from 'valibot'

import { createQuickJSExecutor, type CodeExecutor } from '#mcp/code/executor'
import { toolDeclaration } from '#mcp/code/types'
import { fail, ok } from '#mcp/result'

/** A tool Code Mode scripts call as `openpencil.<name>(args)`, run by its MCP handler. */
export interface CodeModeTool {
  name: string
  description: string
  inputSchema: v.GenericSchema
  run: (args: unknown, context: ServerContext) => Promise<CallToolResult>
}

export interface RegisterCodeToolsOptions {
  executor?: CodeExecutor
  onToolSettled?: (context: ServerContext) => Promise<void>
}

const DEFAULT_SEARCH_LIMIT = 10

const toolErrorSchema = v.object({ error: v.string() })
const jsonTextSchema = v.pipe(v.string(), v.parseJson(), v.unknown())

interface CatalogEntry {
  tool: CodeModeTool
  declaration: string
  summary: string
}

function catalogEntry(tool: CodeModeTool): CatalogEntry {
  const { $schema: _, ...input } = toJSONSchema(tool.inputSchema, {
    typeMode: 'input',
    errorMode: 'ignore'
  })
  return {
    tool,
    declaration: toolDeclaration(tool.name, tool.description, input),
    summary: tool.description.split(/(?<=\.)\s/)[0] ?? tool.description
  }
}

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 0)
  )
}

/** Ranks whole-word name matches above description matches; every query word counts. */
function searchCatalog(entries: readonly CatalogEntry[], query: string, limit: number) {
  const queryWords = [...words(query)]
  return entries
    .map((entry) => {
      const name = words(entry.tool.name)
      const description = words(entry.tool.description)
      const score = queryWords.reduce(
        (sum, word) => sum + (name.has(word) ? 3 : 0) + (description.has(word) ? 1 : 0),
        0
      )
      return { entry, score }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ entry }) => entry)
}

function searchDescription(): string {
  return [
    'Find OpenPencil API methods for the execute tool and get their TypeScript signatures.',
    'Search by what you want to do ("fill color", "auto layout", "export png").',
    'Without a query it lists every method with a one-line summary.'
  ].join(' ')
}

function executeDescription(names: readonly string[]): string {
  return [
    'Run JavaScript in a sandbox that drives OpenPencil. The code is the body of an async function:',
    'call tools as `await openpencil.<method>(args)`, combine many calls in one run, and `return`',
    'a JSON value. `console.log` output comes back with the result. A failed call throws, so',
    '`try`/`catch` works. The sandbox has no filesystem, network, or Node APIs.',
    "Get each method's arguments from the search tool before calling it.",
    '',
    'Example: const page = await openpencil.get_current_page(); return page',
    '',
    `Methods: ${names.join(', ')}`
  ].join('\n')
}

/**
 * Code Mode, after Cloudflare's: in place of one MCP tool per operation, `search` finds methods
 * and `execute` runs a script calling them. Each call runs the operation's own handler, so
 * policy, scope, and file-root checks stay the same as in tool mode.
 */
export function registerCodeTools(
  mcpServer: McpServer,
  tools: readonly CodeModeTool[],
  options: RegisterCodeToolsOptions = {}
): void {
  const executor = options.executor ?? createQuickJSExecutor()
  const entries = tools.map(catalogEntry)
  const byName = new Map(tools.map((tool) => [tool.name, tool]))

  mcpServer.registerTool(
    'search',
    {
      description: searchDescription(),
      inputSchema: toStandardJSONSchema(
        v.strictObject({
          query: v.optional(v.pipe(v.string(), v.description('What you want to do'))),
          limit: v.optional(
            v.pipe(
              v.number(),
              v.integer(),
              v.minValue(1),
              v.description(`Most methods to return (default ${DEFAULT_SEARCH_LIMIT})`)
            )
          )
        })
      ),
      annotations: { readOnlyHint: true }
    },
    async ({ query, limit }) => {
      if (!query?.trim()) {
        return ok({ methods: entries.map((entry) => `${entry.tool.name}: ${entry.summary}`) })
      }
      const found = searchCatalog(entries, query, limit ?? DEFAULT_SEARCH_LIMIT)
      if (found.length === 0) {
        return ok({
          declarations: '',
          hint: 'Nothing matched. Search without a query to list every method.'
        })
      }
      return ok({
        declarations: `declare const openpencil: {\n${found.map((entry) => entry.declaration).join('\n\n')}\n}`
      })
    }
  )

  mcpServer.registerTool(
    'execute',
    {
      description: executeDescription(tools.map((tool) => tool.name)),
      inputSchema: toStandardJSONSchema(
        v.strictObject({
          code: v.pipe(v.string(), v.minLength(1), v.description('Body of an async function'))
        })
      ),
      annotations: { readOnlyHint: false, destructiveHint: true },
      _meta: { 'openpencil/capabilities': ['code:execute'] }
    },
    async ({ code }, context) => {
      const images: Array<{ type: 'image'; data: string; mimeType: string }> = []
      const call = async (name: string, argsJSON: string): Promise<unknown> => {
        const tool = byName.get(name)
        if (!tool) throw new Error(`Unknown method "${name}". Find methods with the search tool.`)
        const parsed = v.safeParse(v.pipe(v.string(), v.parseJson(), tool.inputSchema), argsJSON)
        if (!parsed.success) {
          throw new Error(`Invalid arguments for ${name}:\n${v.summarize(parsed.issues)}`)
        }
        return unwrapToolResult(await tool.run(parsed.output, context), images)
      }
      try {
        const { result, error, logs } = await executor.execute(code, call)
        const text =
          error === undefined
            ? ok({ result, logs }, 'execute')
            : { ...ok({ error, logs }, 'execute'), isError: true }
        return { ...text, content: [...text.content, ...images] }
      } catch (e) {
        return fail(e)
      } finally {
        await options.onToolSettled?.(context)
      }
    }
  )
}

/**
 * A handler's MCP result as a script sees it: the JSON value, or a thrown error. An image stays
 * out of the sandbox; the script gets its index and the image goes back with `execute`'s result.
 */
function unwrapToolResult(
  result: CallToolResult,
  images: Array<{ type: 'image'; data: string; mimeType: string }>
): unknown {
  const values = result.content.map((item) => {
    if (item.type === 'image') {
      images.push({ type: 'image', data: item.data, mimeType: item.mimeType })
      return { image: images.length - 1, mimeType: item.mimeType }
    }
    if (item.type !== 'text') return null
    const parsed = v.safeParse(jsonTextSchema, item.text)
    return parsed.success ? parsed.output : item.text
  })
  const value = values.length === 1 ? values[0] : values
  if (result.isError) {
    const error = v.safeParse(toolErrorSchema, value)
    throw new Error(error.success ? error.output.error : JSON.stringify(value))
  }
  return value
}
