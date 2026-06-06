import { createBrowserClient } from '@supabase/ssr'

// Browser-side Supabase client for client components.
// Uses the public anon key; RLS enforces what each authenticated user can see.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
