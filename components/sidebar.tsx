'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { signOut } from '@/app/login/actions'
import {
  LayoutDashboard,
  Building2,
  Users,
  Search,
  MapPin,
  Mail,
  UploadCloud,
  BarChart3,
  CheckSquare,
  FileText,
  ClipboardCheck,
  ChevronRight,
  LogOut,
} from 'lucide-react'

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { divider: 'Track A — New Clients' },
  { href: '/leads', label: 'Lead Finder', icon: Search },
  { href: '/qualify', label: 'Qualify Queue', icon: ClipboardCheck },
  { href: '/crm/companies', label: 'Companies', icon: Building2 },
  { href: '/crm/contacts', label: 'Contacts', icon: Users },
  { href: '/outreach', label: 'Outreach', icon: Mail },
  { divider: 'Track B — Listings' },
  { href: '/listings', label: 'Listings', icon: MapPin },
  { divider: 'Operations' },
  { href: '/imports', label: 'Data Imports', icon: UploadCloud },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/follow-up', label: 'Post-Close', icon: CheckSquare },
  { href: '/thought-leadership', label: 'Thought Leadership', icon: FileText },
] as const

export function Sidebar({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname()

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-card flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-primary flex items-center justify-center">
            <ChevronRight className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">Seal Team BD</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">C&W Platform</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {NAV.map((item, i) => {
          if ('divider' in item) {
            return (
              <p key={i} className="px-2 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {item.divider}
              </p>
            )
          }
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors',
                active
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer — current user + sign-out */}
      <div className="px-3 py-3 border-t border-border space-y-2">
        {userEmail && (
          <div className="flex items-center gap-2 px-1">
            <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-semibold uppercase shrink-0">
              {userEmail.slice(0, 2)}
            </div>
            <p className="text-xs text-muted-foreground truncate" title={userEmail}>
              {userEmail}
            </p>
          </div>
        )}
        <form action={signOut}>
          <button
            type="submit"
            className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sign out
          </button>
        </form>
        <p className="text-[10px] text-muted-foreground px-1">
          Cushman &amp; Wakefield · {new Date().getFullYear()}
        </p>
      </div>
    </aside>
  )
}
