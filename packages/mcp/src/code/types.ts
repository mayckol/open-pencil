/**
 * TypeScript declarations for Code Mode, written from the JSON Schema each tool's input converts
 * to. A schema shape this does not know reads as `unknown` rather than failing.
 */

import { uniq } from 'es-toolkit/array'

type JSONSchema = Record<string, unknown>

function isSchema(value: unknown): value is JSONSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function schemaList(value: unknown): JSONSchema[] {
  return Array.isArray(value) ? value.filter(isSchema) : []
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

function propertyKey(name: string): string {
  return IDENTIFIER.test(name) ? name : JSON.stringify(name)
}

function docComment(description: unknown, indent: string): string {
  if (typeof description !== 'string' || !description.trim()) return ''
  // `*/` inside a description would end the comment early.
  const lines = description.trim().replaceAll('*/', '*\\/').split('\n')
  if (lines.length === 1) return `${indent}/** ${lines[0]} */\n`
  return `${indent}/**\n${lines.map((line) => `${indent} * ${line}`).join('\n')}\n${indent} */\n`
}

function literal(value: unknown): string {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value)
    ? JSON.stringify(value)
    : 'unknown'
}

function union(types: string[]): string {
  const unique = uniq(types)
  if (unique.includes('unknown')) return 'unknown'
  return unique.length === 0 ? 'never' : unique.join(' | ')
}

function objectType(schema: JSONSchema, indent: string): string {
  const properties = isSchema(schema.properties) ? schema.properties : {}
  const required = new Set(
    Array.isArray(schema.required) ? schema.required.filter((k) => typeof k === 'string') : []
  )
  const inner = `${indent}  `
  const members = Object.entries(properties)
    .filter((entry): entry is [string, JSONSchema] => isSchema(entry[1]))
    .map(
      ([name, property]) =>
        `${docComment(property.description, inner)}${inner}${propertyKey(name)}${
          required.has(name) ? '' : '?'
        }: ${schemaToType(property, inner)}`
    )
  if (isSchema(schema.additionalProperties)) {
    members.push(`${inner}[key: string]: ${schemaToType(schema.additionalProperties, inner)}`)
  }
  if (members.length === 0) {
    return schema.additionalProperties === false
      ? 'Record<string, never>'
      : 'Record<string, unknown>'
  }
  return `{\n${members.join('\n')}\n${indent}}`
}

export function schemaToType(schema: JSONSchema, indent = ''): string {
  if ('const' in schema) return literal(schema.const)
  if (Array.isArray(schema.enum)) return union(schema.enum.map(literal))
  const variants = [...schemaList(schema.anyOf), ...schemaList(schema.oneOf)]
  if (variants.length > 0) {
    return union(variants.map((variant) => schemaToType(variant, indent)))
  }
  const allOf = schemaList(schema.allOf)
  if (allOf.length > 0) {
    return allOf.map((part) => intersectionMember(schemaToType(part, indent))).join(' & ')
  }

  const types = Array.isArray(schema.type) ? schema.type : [schema.type]
  return union(
    types.map((type) => {
      switch (type) {
        case 'string':
          return 'string'
        case 'number':
        case 'integer':
          return 'number'
        case 'boolean':
          return 'boolean'
        case 'null':
          return 'null'
        case 'array': {
          if (Array.isArray(schema.items)) {
            return `[${schemaList(schema.items)
              .map((item) => schemaToType(item, indent))
              .join(', ')}]`
          }
          const item = isSchema(schema.items) ? schemaToType(schema.items, indent) : 'unknown'
          return `Array<${item}>`
        }
        case 'object':
          return objectType(schema, indent)
        default:
          return 'unknown'
      }
    })
  )
}

// `&` binds tighter than `|`, so a union inside an intersection needs parentheses.
function intersectionMember(type: string): string {
  return type.includes(' | ') && !type.startsWith('{') ? `(${type})` : type
}

/** One method of the `openpencil` global, documented with the tool's description. */
export function toolDeclaration(name: string, description: string, schema: object): string {
  const input = isSchema(schema) ? schema : {}
  const args = schemaToType(input, '  ')
  const optional = !Array.isArray(input.required) || input.required.length === 0
  return `${docComment(description, '  ')}  ${propertyKey(name)}(args${optional ? '?' : ''}: ${args}): Promise<unknown>`
}
