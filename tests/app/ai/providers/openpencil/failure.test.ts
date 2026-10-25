import { describe, expect, test } from 'bun:test'

import { createCloudAIClient } from '@open-pencil/cloud/client'

import { createLanguageModel } from '@/app/ai/models/language-model'
import { cloudCreditsResetAt } from '@/app/ai/providers/openpencil/failure'
import { cloudModelConfig } from '@/app/ai/providers/openpencil/model'

/** What a model request fails with when the service answers `status` with `body`. */
async function modelFailure(status: number, body: unknown): Promise<unknown> {
  const client = createCloudAIClient({
    endpoint: 'https://ai.example.com',
    tokens: { token: async () => 'cloud-token', invalidate: () => undefined },
    fetch: async () => Response.json(body, { status })
  })
  const { config, runtime } = cloudModelConfig(client, 'test/model')
  const model = createLanguageModel(config, runtime)
  if (typeof model === 'string') throw new Error('Expected a model instance')
  try {
    await model.doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] })
  } catch (error) {
    return error
  }
  throw new Error('The request did not fail')
}

describe('cloudCreditsResetAt', () => {
  test('reads when the allowance renews from the service’s refusal', async () => {
    const error = await modelFailure(402, {
      error: { code: 'insufficient_credits', resetsAt: '2026-11-01T00:00:00.000Z' }
    })
    expect(cloudCreditsResetAt(error)).toBe('2026-11-01T00:00:00.000Z')
  })

  test('is unknown when the service does not say, or refused for another reason', async () => {
    expect(
      cloudCreditsResetAt(await modelFailure(402, { error: { code: 'insufficient_credits' } }))
    ).toBeNull()
    expect(
      cloudCreditsResetAt(
        await modelFailure(429, {
          error: { code: 'rate_limited', resetsAt: '2026-11-01T00:00:00.000Z' }
        })
      )
    ).toBeNull()
    expect(cloudCreditsResetAt(new Error('offline'))).toBeNull()
  })
})
