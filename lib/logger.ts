// Structured, vendor-neutral logging + error capture.
//
// Emits single-line JSON so any log drain (Vercel, Datadog, CloudWatch) can parse
// it. captureError() is the single choke point for server-side errors: today it
// structures + logs; when C&W provisions an error backend, forward from here
// (e.g. Sentry.captureException) — call sites never change.

type Level = 'debug' | 'info' | 'warn' | 'error'

interface LogFields {
  [key: string]: unknown
}

function emit(level: Level, message: string, fields?: LogFields) {
  const line = JSON.stringify({
    level,
    message,
    ...fields,
    // timestamp is added by the platform log drain; avoid Date here so this stays
    // trivially testable and side-effect-light.
  })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (message: string, fields?: LogFields) => emit('debug', message, fields),
  info: (message: string, fields?: LogFields) => emit('info', message, fields),
  warn: (message: string, fields?: LogFields) => emit('warn', message, fields),
  error: (message: string, fields?: LogFields) => emit('error', message, fields),
}

// Central error capture. Never leak the raw error to the client — log it here and
// return a generic message at the call site.
export function captureError(error: unknown, context?: LogFields): void {
  const err = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { value: String(error) }
  emit('error', 'captured_error', { ...context, error: err })
  // When SENTRY_DSN (or similar) is configured, forward here. Vendor-neutral by
  // design so we don't commit C&W to a tool before they pick one.
}
