'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

// Route-segment error boundary. Catches render/data errors below the layout and
// shows a recoverable fallback instead of a white screen.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Client-side capture; the server logs via lib/logger.captureError.
    console.error('Route error:', error)
  }, [error])

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          An unexpected error occurred. You can retry, or head back to the dashboard.
        </p>
        {error.digest && <p className="text-xs text-muted-foreground">Reference: {error.digest}</p>}
        <div className="flex justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" onClick={() => (window.location.href = '/dashboard')}>
            Dashboard
          </Button>
        </div>
      </div>
    </div>
  )
}
