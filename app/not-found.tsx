import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function NotFound() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md text-center space-y-4">
        <p className="text-4xl font-bold text-muted-foreground">404</p>
        <h2 className="text-lg font-semibold">Page not found</h2>
        <p className="text-sm text-muted-foreground">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
        <Link href="/dashboard" className={cn(buttonVariants({ variant: 'default', size: 'sm' }))}>
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
