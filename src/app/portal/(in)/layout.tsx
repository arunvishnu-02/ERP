'use client'
import { FileText, Home, LifeBuoy, LogOut, Receipt, FolderKanban } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Brand, PortalCtx, type PortalMe } from '@/components/portal'
import { Loading, cn } from '@/components/ui'
import { api, useApi } from '@/lib/api'

const NAV = [
  ['/portal', 'Home', Home], ['/portal/quotations', 'Quotations', FileText], ['/portal/invoices', 'Invoices', Receipt],
  ['/portal/projects', 'Projects', FolderKanban], ['/portal/support', 'Support', LifeBuoy],
] as const

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const router = useRouter()
  const { data: me } = useApi<PortalMe>('/portal/me')
  const active = (href: string) => (href === '/portal' ? path === '/portal' : path.startsWith(href))
  if (!me) return <Loading />
  const signOut = async () => { await api('/portal/auth/logout', { method: 'POST' }); router.replace('/portal/login') }
  return (
    <PortalCtx.Provider value={me}>
      <div className="min-h-screen bg-surface-2 pb-20 md:pb-0">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
            <Link href="/portal" className="flex min-w-0 items-center gap-2"><Brand name={me.organization.name} logo={me.organization.logo} /></Link>
            <nav className="hidden items-center gap-1 md:flex">
              {NAV.map(([href, label]) => <Link key={href} href={href} className={cn('rounded-lg px-3 py-1.5 text-sm font-medium', active(href) ? 'bg-accent-soft text-ink' : 'text-muted hover:text-ink')}>{label}</Link>)}
            </nav>
            <div className="flex items-center gap-2 text-right">
              <span className="hidden text-[13px] leading-tight sm:block"><span className="block font-medium">{[me.contact.firstName, me.contact.lastName].filter(Boolean).join(' ')}</span><span className="text-muted">{me.customer.name}</span></span>
              <button type="button" onClick={signOut} aria-label="Sign out" title="Sign out" className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"><LogOut size={17} /></button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-surface md:hidden">
          {NAV.map(([href, label, Icon]) => <Link key={href} href={href} className={cn('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', active(href) ? 'text-accent' : 'text-muted')}><Icon size={20} />{label}</Link>)}
        </nav>
      </div>
    </PortalCtx.Provider>
  )
}
