import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

// Next 16 request interceptor (formerly middleware.ts). Runs before every
// matched route to refresh the session and block unauthenticated access.
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // Run on everything except Next internals and static image assets.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
