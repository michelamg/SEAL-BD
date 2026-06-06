'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function safeNext(next: FormDataEntryValue | null): string {
  const n = typeof next === 'string' ? next : ''
  // Same-origin absolute paths only: a single leading slash followed by a normal
  // path char. Blocks //evil.com AND the /\evil.com backslash bypass (browsers
  // normalize "\" to "/", making it scheme-relative → off-site redirect).
  return /^\/[^/\\]/.test(n) ? n : '/dashboard'
}

export async function login(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  })
  if (error) {
    redirect('/login?error=' + encodeURIComponent(error.message))
  }
  revalidatePath('/', 'layout')
  redirect(safeNext(formData.get('next')))
}

// Self-registration is closed by default (enterprise posture): with shared-team
// RLS, any account can read the whole pipeline, so we never let arbitrary emails
// register. Allow only domains in ALLOWED_SIGNUP_DOMAINS (comma-separated). The
// first admin is seeded via the Supabase dashboard, not this form. The strongest
// control is still disabling sign-ups in Supabase Auth settings.
function signupAllowed(email: string): boolean {
  const raw = process.env.ALLOWED_SIGNUP_DOMAINS?.trim()
  if (!raw) return false
  const domains = raw.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean)
  const at = email.lastIndexOf('@')
  if (at < 0) return false
  return domains.includes(email.slice(at + 1).toLowerCase())
}

export async function signup(formData: FormData) {
  const email = String(formData.get('email') ?? '')
  if (!signupAllowed(email)) {
    redirect(
      '/login?error=' +
        encodeURIComponent('Self-registration is disabled. Contact your administrator for an account.'),
    )
  }
  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password: String(formData.get('password') ?? ''),
  })
  if (error) {
    redirect('/login?error=' + encodeURIComponent(error.message))
  }
  revalidatePath('/', 'layout')
  redirect(safeNext(formData.get('next')))
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
