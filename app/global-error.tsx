'use client'

import { useEffect } from 'react'

// Top-level error boundary — catches errors in the root layout itself. Must
// render its own <html>/<body> because it replaces the whole document.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Global error:', error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong</h2>
          <p style={{ fontSize: 14, color: '#666', marginTop: 8 }}>
            A critical error occurred. Please reload the page.
          </p>
          <button
            onClick={reset}
            style={{ marginTop: 16, padding: '8px 16px', borderRadius: 8, border: '1px solid #ccc', cursor: 'pointer' }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  )
}
