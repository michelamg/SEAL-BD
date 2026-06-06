import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { parseJson } from './validate'

const schema = z.object({ companyId: z.string().min(1), count: z.number().optional() })

function req(body: string): Request {
  return new Request('http://test/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
}

describe('parseJson', () => {
  it('returns typed data for a valid body', async () => {
    const r = await parseJson(req(JSON.stringify({ companyId: 'abc', count: 3 })), schema)
    expect('data' in r).toBe(true)
    if ('data' in r) expect(r.data.companyId).toBe('abc')
  })

  it('rejects malformed JSON with a 400', async () => {
    const r = await parseJson(req('{not json'), schema)
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error.status).toBe(400)
  })

  it('rejects a schema violation with a 400', async () => {
    const r = await parseJson(req(JSON.stringify({ count: 3 })), schema) // missing companyId
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error.status).toBe(400)
  })
})
