import { describe, expect, test } from 'bun:test'

import { schemaToType, toolDeclaration } from '#mcp/code/types'

describe('Code Mode declarations', () => {
  test('object properties keep their optionality and descriptions', () => {
    expect(
      schemaToType({
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Node ID' },
          depth: { anyOf: [{ type: 'number' }, { type: 'string' }] },
          'kebab-key': { type: 'boolean' }
        },
        required: ['id']
      })
    ).toBe(
      '{\n  /** Node ID */\n  id: string\n  depth?: number | string\n  "kebab-key"?: boolean\n}'
    )
  })

  test('enums, consts, arrays, and records', () => {
    expect(schemaToType({ enum: ['FRAME', 'TEXT'] })).toBe('"FRAME" | "TEXT"')
    expect(schemaToType({ const: 3 })).toBe('3')
    expect(
      schemaToType({ type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'null' }] } })
    ).toBe('Array<string | null>')
    expect(schemaToType({ type: 'object', additionalProperties: { type: 'number' } })).toBe(
      '{\n  [key: string]: number\n}'
    )
  })

  test('a union inside an intersection keeps its precedence', () => {
    expect(schemaToType({ allOf: [{ enum: ['a', 'b'] }, { type: 'string' }] })).toBe(
      '("a" | "b") & string'
    )
  })

  test('unknown shapes read as unknown', () => {
    expect(schemaToType({})).toBe('unknown')
    expect(schemaToType({ anyOf: [{ type: 'string' }, {}] })).toBe('unknown')
  })

  test('a description cannot close the doc comment early', () => {
    expect(toolDeclaration('t', 'a */ b', { type: 'object' })).toContain('a *\\/ b')
  })

  test('arguments are optional when nothing is required', () => {
    expect(toolDeclaration('list_pages', 'List pages.', { type: 'object', properties: {} })).toBe(
      '  /** List pages. */\n  list_pages(args?: Record<string, unknown>): Promise<unknown>'
    )
  })
})
