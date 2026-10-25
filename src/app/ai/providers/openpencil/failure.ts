import { APICallError } from 'ai'
import * as v from 'valibot'

import { aiErrorSchema } from '@open-pencil/cloud/contract'

const errorBodySchema = v.pipe(v.string(), v.parseJson(), aiErrorSchema)

/** When Cloud's AI service says a workspace out of credits gets them back, if it says. */
export function cloudCreditsResetAt(error: unknown): string | null {
  if (!APICallError.isInstance(error) || error.responseBody === undefined) return null
  const parsed = v.safeParse(errorBodySchema, error.responseBody)
  if (!parsed.success || parsed.output.error.code !== 'insufficient_credits') return null
  return parsed.output.error.resetsAt ?? null
}
