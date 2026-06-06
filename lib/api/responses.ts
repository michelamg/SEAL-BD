// Consistent JSON response helpers for route handlers. Keeps error shapes uniform
// and ensures we never leak raw exception text to clients.

export function jsonOk(data: unknown, status = 200): Response {
  return Response.json(data, { status })
}

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>): Response {
  return Response.json({ error: message, ...extra }, { status })
}

export const Errors = {
  unauthenticated: () => jsonError('Not authenticated', 401),
  forbidden: () => jsonError('Forbidden', 403),
  badRequest: (message = 'Invalid request') => jsonError(message, 400),
  rateLimited: (retryAfterSec: number) =>
    Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }),
  internal: () => jsonError('Request failed', 500),
}
