/**
 * How clients reach the tools: one MCP tool per operation, or Code Mode, where `search` finds
 * operations and `execute` runs a sandboxed script that calls them (`#mcp/code/tools`).
 */
export const MCP_TOOL_MODES = ['tools', 'code'] as const
export type MCPToolMode = (typeof MCP_TOOL_MODES)[number]

export function parseToolMode(value: string | undefined): MCPToolMode {
  const mode = value?.trim() || 'tools'
  if (mode === 'tools' || mode === 'code') return mode
  throw new Error('OPENPENCIL_MCP_MODE must be "tools" or "code"')
}
