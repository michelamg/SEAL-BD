import { createBrowserClient } from '@supabase/ssr'
import { type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// ─── Browser client (session-aware) ──────────────────────────────────────────
// One client per tab, built lazily on first use so it never instantiates during
// SSR / `next build`. It carries the signed-in user's session via cookies, so
// Row-Level Security applies *per authenticated user*.
//
// This replaces the previous plain `createClient` anon singleton, which sent no
// session — under RLS every request would have been treated as anonymous and
// returned nothing. All existing `import { supabase } from '@/lib/supabase'`
// call sites keep working unchanged via the proxy below.
let browserClient: SupabaseClient | undefined

function getBrowserClient(): SupabaseClient {
  browserClient ??= createBrowserClient(supabaseUrl, supabaseAnonKey)
  return browserClient
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getBrowserClient()
    const value = client[prop as keyof SupabaseClient]
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(client) : value
  },
})

// Server clients live elsewhere so they're never pulled into a client bundle:
//   • lib/supabase/server.ts  — request-scoped session client (RLS as the user)
//   • lib/supabase/admin.ts    — service-role client (bypasses RLS; server-only)
