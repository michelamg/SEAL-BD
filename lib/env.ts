import { z } from 'zod'
import { logger } from './logger'

// Centralized, validated environment configuration.
//
// Enterprise posture: fail fast on misconfiguration in production, but never
// break local dev or `next build` (which run with placeholder values). Required
// vars are checked for presence + shape; optional integrations are typed so call
// sites get autocomplete and a single source of truth.

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  // Server-only secrets (never NEXT_PUBLIC_). Optional at type level so the
  // browser bundle / build never requires them; routes that need them assert.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  APOLLO_API_KEY: z.string().optional(),
  SERP_API_KEY: z.string().optional(),
  ZOOMINFO_CLIENT_ID: z.string().optional(),
  ZOOMINFO_PRIVATE_KEY: z.string().optional(),
  ALLOWED_SIGNUP_DOMAINS: z.string().optional(),
  SEC_EDGAR_UA: z.string().optional(),
  // Explorium (Vibe Prospecting) — Phase 2 signal source, off unless enabled.
  EXPLORIUM_API_KEY: z.string().optional(),
  EXPLORIUM_API_BASE: z.string().url().optional(),
  EXPLORIUM_ENABLED: z.enum(['true', 'false']).optional(),
  // Building permits — JSON array of Socrata dataset specs; empty = source off.
  PERMITS_DATASETS: z.string().optional(),
  SOCRATA_APP_TOKEN: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

let cached: Env | null = null

// Validate once. In production an invalid/missing required var throws (fail fast);
// in dev/build we log a warning and continue so placeholders don't block work.
export function getEnv(): Env {
  if (cached) return cached
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    if (process.env.NODE_ENV === 'production' && !process.env.SKIP_ENV_VALIDATION) {
      throw new Error(`Invalid environment configuration: ${issues}`)
    }
    logger.warn('env_validation_failed', { issues })
    cached = process.env as unknown as Env
    return cached
  }
  cached = parsed.data
  return cached
}

// Assert a server-only secret is present before using it (paid APIs, service role).
export function requireServerEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = getEnv()[key]
  if (!value) throw new Error(`Missing required server environment variable: ${String(key)}`)
  return value as NonNullable<Env[K]>
}
