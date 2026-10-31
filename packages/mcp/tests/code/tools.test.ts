import { describe, expect, test } from 'bun:test'

import { Client } from '@modelcontextprotocol/client'
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server'

import { registerTools } from '#mcp/tool/registration'

interface RPCCall {
  name: string
  args: Record<string, unknown>
}

/** A Code Mode server whose app answers each tool with `answer(call)`. */
async function codeModeClient(answer: (call: RPCCall) => unknown) {
  const calls: RPCCall[] = []
  const server = new McpServer({ name: 'open-pencil', version: '0.0.0' })
  registerTools(server, {
    policy: { allowEval: false, disabledTools: ['delete_node'], scope: 'document', mode: 'code' },
    sendRPC: async (body) => {
      const { args } = body as { args: RPCCall }
      calls.push({ name: args.name, args: args.args })
      const result = answer(args)
      return result instanceof Error ? { ok: false, error: result.message } : { ok: true, result }
    }
  })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  const client = new Client({ name: 'test', version: '1' })
  await client.connect(clientTransport)
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args })
    const [first] = result.content as { type: string; text: string }[]
    return { isError: result.isError === true, body: JSON.parse(first?.text ?? 'null') as unknown }
  }
  return { client, call, calls }
}

describe('MCP Code Mode', () => {
  test('lists only search and execute', async () => {
    const { client } = await codeModeClient(() => ({}))
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual(['execute', 'search'])
  })

  test('search returns TypeScript signatures for matching methods', async () => {
    const { call } = await codeModeClient(() => ({}))
    const { body } = await call('search', { query: 'get node' })
    const { declarations } = body as { declarations: string }
    expect(declarations).toStartWith('declare const openpencil: {')
    expect(declarations).toContain('get_node(args: {')
    expect(declarations).toContain('id: string')
  })

  test('search leaves out disabled tools', async () => {
    const { call } = await codeModeClient(() => ({}))
    const { body } = await call('search', {})
    const { methods } = body as { methods: string[] }
    expect(methods.some((method) => method.startsWith('get_node:'))).toBe(true)
    expect(methods.some((method) => method.startsWith('delete_node:'))).toBe(false)
  })

  test('execute runs several tool calls through the app in one script', async () => {
    const { call, calls } = await codeModeClient(({ name, args }) =>
      name === 'get_node' ? { id: args.id, name: 'Frame' } : { pages: ['Page 1'] }
    )
    const { isError, body } = await call('execute', {
      code: 'const node = await openpencil.get_node({ id: "1:2" }); const pages = await openpencil.list_pages(); console.log(node.name); return { node, pages }'
    })
    expect(isError).toBe(false)
    expect(body).toEqual({
      result: { node: { id: '1:2', name: 'Frame' }, pages: { pages: ['Page 1'] } },
      logs: ['Frame']
    })
    expect(calls).toEqual([
      { name: 'get_node', args: { id: '1:2' } },
      { name: 'list_pages', args: {} }
    ])
  })

  test('arguments are validated against the tool schema before reaching the app', async () => {
    const { call, calls } = await codeModeClient(() => ({}))
    const { body } = await call('execute', {
      code: 'try { await openpencil.get_node({ id: 1 }) } catch (e) { return e.message }'
    })
    expect((body as { result: string }).result).toStartWith('Invalid arguments for get_node')
    expect(calls).toEqual([])
  })

  test('app errors, disabled tools, and unknown methods throw inside the script', async () => {
    const { call } = await codeModeClient(() => new Error('Node "9:9" not found'))
    const { body } = await call('execute', {
      code: `const errors = []
for (const run of [
  () => openpencil.get_node({ id: "9:9" }),
  () => openpencil.delete_node({ id: "1:2" }),
  () => openpencil.nope()
]) {
  try { await run() } catch (e) { errors.push(e.message) }
}
return errors`
    })
    expect((body as { result: string[] }).result).toEqual([
      'Node "9:9" not found',
      'Unknown method "delete_node". Find methods with the search tool.',
      'Unknown method "nope". Find methods with the search tool.'
    ])
  })

  test('an uncaught script error is an MCP error result', async () => {
    const { call } = await codeModeClient(() => ({}))
    const { isError, body } = await call('execute', { code: 'throw new Error("boom")' })
    expect(isError).toBe(true)
    expect((body as { error: string }).error).toContain('boom')
  })
})
