import { describe, expect, test } from 'bun:test'

import { createQuickJSExecutor } from '#mcp/code/executor'

const noTools = () => Promise.reject(new Error('no tools'))

describe('QuickJS Code Mode executor', () => {
  test('returns the script result and its console output', async () => {
    const result = await createQuickJSExecutor().execute(
      'console.log("hello", { a: 1 }); return [1, "two", { three: 3 }]',
      noTools
    )
    expect(result).toEqual({ result: [1, 'two', { three: 3 }], logs: ['hello {"a":1}'] })
  })

  test('calls host tools with JSON arguments and awaits their answers', async () => {
    const calls: [string, string][] = []
    const result = await createQuickJSExecutor().execute(
      'const a = await openpencil.get_node({ id: "1:2" }); const b = await openpencil.list_pages(); return [a, b]',
      async (name, argsJSON) => {
        calls.push([name, argsJSON])
        return { name }
      }
    )
    expect(calls).toEqual([
      ['get_node', '{"id":"1:2"}'],
      ['list_pages', '{}']
    ])
    expect(result.result).toEqual([{ name: 'get_node' }, { name: 'list_pages' }])
  })

  test('a failed tool throws inside the script, where it can be caught', async () => {
    const result = await createQuickJSExecutor().execute(
      'try { await openpencil.get_node({ id: "x" }) } catch (e) { return e.message }',
      () => Promise.reject(new Error('Node "x" not found'))
    )
    expect(result.result).toBe('Node "x" not found')
  })

  test('an uncaught error is the result error', async () => {
    const result = await createQuickJSExecutor().execute('throw new Error("boom")', noTools)
    expect(result.error).toContain('boom')
  })

  test('the sandbox has no Node or host globals', async () => {
    const result = await createQuickJSExecutor().execute(
      'return [typeof process, typeof require, typeof fetch, typeof globalThis.Bun]',
      noTools
    )
    expect(result.result).toEqual(['undefined', 'undefined', 'undefined', 'undefined'])
  })

  test('a script that never ends is stopped at the timeout', async () => {
    const result = await createQuickJSExecutor({ timeoutMs: 200 }).execute(
      'while (true) {}',
      noTools
    )
    expect(result.error).toBeString()
  })

  test('a script waiting on a slow tool is stopped at the timeout', async () => {
    const result = await createQuickJSExecutor({ timeoutMs: 200 }).execute(
      'return await openpencil.slow()',
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, 1000)
        })
    )
    expect(result.error).toBe('Execution timed out after 200 ms')
  })
})
