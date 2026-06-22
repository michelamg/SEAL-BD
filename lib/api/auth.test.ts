import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the server Supabase client so we can drive auth.getUser() + the profiles
// approval lookup without a real DB. requireUser is the single choke point every
// route calls, so its approval gate (D2) is security-critical and worth pinning.
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
import { createClient } from '@/lib/supabase/server'
import { requireUser, requireAdmin } from './auth'

function fakeClient(user: { id: string } | null, profile: Record<string, unknown> | null) {
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile }) }) }),
    }),
  }
}
const mockClient = (user: { id: string } | null, profile: Record<string, unknown> | null) =>
  (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeClient(user, profile))

beforeEach(() => vi.clearAllMocks())

describe('requireUser (approval gate)', () => {
  it('401s when there is no authenticated user', async () => {
    mockClient(null, null)
    const r = await requireUser()
    expect('error' in r && r.error.status).toBe(401)
  })

  it('403s an authenticated but UNAPPROVED account', async () => {
    mockClient({ id: 'u1' }, { approved: false })
    const r = await requireUser()
    expect('error' in r && r.error.status).toBe(403)
  })

  it('403s when no profile row exists yet', async () => {
    mockClient({ id: 'u1' }, null)
    const r = await requireUser()
    expect('error' in r && r.error.status).toBe(403)
  })

  it('passes an approved user through', async () => {
    mockClient({ id: 'u1' }, { approved: true })
    const r = await requireUser()
    expect('user' in r && r.user.id).toBe('u1')
  })
})

describe('requireAdmin', () => {
  it('403s an approved non-admin', async () => {
    mockClient({ id: 'u1' }, { approved: true, role: 'broker' })
    const r = await requireAdmin()
    expect('error' in r && r.error.status).toBe(403)
  })

  it('passes an approved admin through', async () => {
    mockClient({ id: 'u1' }, { approved: true, role: 'admin' })
    const r = await requireAdmin()
    expect('user' in r && r.user.id).toBe('u1')
  })
})
