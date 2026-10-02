'use client'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { Bell, Building2, ChartColumn, FileText, Files, FolderKanban, Globe, Handshake, Landmark, Laptop, LayoutDashboard, LifeBuoy, LockKeyhole, LogOut, Megaphone, MenuIcon, MessagesSquare, Moon, Receipt, Settings, SquareCheckBig, Sun, UserPlus, UserRound, Users, Wallet, Zap } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { FormDialog } from '@/components/form'
import { Avatar, Button, cn } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { AuthProvider, useAuth } from '@/lib/auth'
import { ago } from '@/lib/format'

export const NAV: { group: string; items: [path: string, label: string, module: string, icon: any][] }[] = [
  { group: 'Overview', items: [['dashboard', 'Dashboard', 'DASHBOARD', LayoutDashboard]] },
  { group: 'CRM', items: [['leads', 'Leads', 'LEADS', UserPlus], ['customers', 'Customers', 'CUSTOMERS', Building2], ['sales', 'Sales CRM', 'SALES', Handshake]] },
  { group: 'Sales', items: [['quotations', 'Quotations', 'QUOTATIONS', FileText], ['invoices', 'Invoices', 'INVOICES', Receipt], ['payments', 'Payments', 'PAYMENTS', Wallet]] },
  { group: 'Delivery', items: [['projects', 'Projects', 'PROJECTS', FolderKanban], ['tasks', 'Tasks', 'TASKS', SquareCheckBig], ['marketing', 'Digital marketing', 'MARKETING', Megaphone], ['websites', 'Websites', 'WEBSITES', Globe], ['tickets', 'Support tickets', 'TICKETS', LifeBuoy]] },
  { group: 'Back office', items: [['documents', 'Documents', 'DOCUMENTS', Files], ['hr', 'HR', 'HR', Users], ['assets', 'Assets', 'ASSETS', Laptop], ['finance', 'Finance', 'FINANCE', Landmark], ['reports', 'Reports', 'REPORTS', ChartColumn]] },
  { group: 'System', items: [['automation', 'Automation', 'AUTOMATION', Zap], ['communication', 'Communication', 'COMMUNICATION', MessagesSquare], ['settings', 'Settings', 'SETTINGS', Settings]] },
]
const TITLES: Record<string, string> = Object.fromEntries([...NAV.flatMap((g) => g.items.map(([p, l]) => [p, l])), ['profile', 'My profile']])

function Notifications() {
  const router = useRouter()
  const { data, reload } = useApi<{ items: any[]; unread: number }>('/notifications')
  useEffect(() => { const t = setInterval(reload, 20_000); return () => clearInterval(t) }, [reload])
  const read = async (ids?: string[]) => { await api('/notifications/read', { body: ids ? { ids } : {} }).catch(() => {}); reload() }
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <Button size="icon" variant="ghost" aria-label={`Notifications, ${data?.unread ?? 0} unread`} className="relative">
          <Bell size={18} />
          {!!data?.unread && <span className="num absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-semibold text-white">{data.unread > 9 ? '9+' : data.unread}</span>}
        </Button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className="z-50 max-h-[70vh] w-80 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-xl">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="font-display text-[15px] font-semibold">Notifications</span>
            {!!data?.unread && <button className="text-xs text-accent hover:underline" onClick={() => read()}>Mark all as read</button>}
          </div>
          {!data?.items.length && <p className="px-3 pb-3 text-sm text-muted">Nothing yet. Assignments, approvals and reminders appear here.</p>}
          {data?.items.map((n) => (
            <Menu.Item key={n.id} onSelect={() => { if (!n.readAt) read([n.id]); if (n.link) router.push(n.link) }} className="flex cursor-pointer gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-surface-2">
              <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-accent')} />
              <span className="min-w-0"><span className="block break-words">{n.title}</span><span className="text-xs text-muted">{ago(n.createdAt)}</span></span>
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'
  return <Button size="icon" variant="ghost" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setTheme(dark ? 'light' : 'dark')}>{dark ? <Sun size={18} /> : <Moon size={18} />}</Button>
}

function Shell({ children }: { children: React.ReactNode }) {
  const { me, can, logout, lookups, reloadMe } = useAuth()
  const key = usePathname().split('/')[1] || 'dashboard'
  const [open, setOpen] = useState(false)
  useEffect(() => { document.title = `${TITLES[key] ?? 'CX CRM ERP'} | CX CRM ERP` }, [key])
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[236px_minmax(0,1fr)]">
      <aside className={cn('fixed inset-y-0 left-0 z-40 flex w-60 flex-col overflow-y-auto bg-rail text-rail-ink transition-transform duration-150 lg:sticky lg:top-0 lg:h-screen lg:w-auto lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')} aria-label="Modules">
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-ink"><LockKeyhole size={17} /></span>
          <span className="min-w-0"><span className="block font-display text-base leading-tight font-semibold text-white">CX CRM ERP</span><span className="block truncate text-xs text-rail-mute">{lookups.organization.name}</span></span>
        </div>
        <nav className="flex-1 space-y-4 px-3 pb-6">
          {NAV.map((g) => {
            const items = g.items.filter(([, , module]) => can(module))
            if (!items.length) return null
            return (
              <div key={g.group}>
                <div className="px-2.5 pb-1 text-xs text-rail-mute">{g.group}</div>
                {items.map(([path, label, , Icon]) => (
                  <Link key={path} href={`/${path}`} onClick={() => setOpen(false)} aria-current={key === path ? 'page' : undefined} className={cn('flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px] hover:bg-rail-active hover:text-white', key === path && 'bg-rail-active font-medium text-white')}>
                    <Icon size={16} className={key === path ? 'text-accent' : 'text-rail-mute'} />{label}
                  </Link>
                ))}
              </div>
            )
          })}
        </nav>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg/95 px-4 py-2.5 backdrop-blur lg:px-7">
          <Button size="icon" variant="ghost" className="lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><MenuIcon size={18} /></Button>
          <h1 className="min-w-0 flex-1 truncate font-display text-xl font-semibold tracking-tight">{TITLES[key] ?? 'CX CRM ERP'}</h1>
          <Notifications />
          <ThemeToggle />
          <Menu.Root>
            <Menu.Trigger className="flex items-center gap-2 rounded-lg py-1 pr-2 pl-1 text-sm hover:bg-surface-2">
              <Avatar name={me.name} className="h-7 w-7 text-[11px]" /><span className="hidden max-w-36 truncate sm:block">{me.name}</span>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content align="end" sideOffset={6} className="z-50 w-60 rounded-xl border border-line bg-surface p-1 text-sm shadow-xl">
                <div className="px-3 py-2"><div className="font-medium">{me.name}</div><div className="text-xs text-muted">{me.roles.map((r) => r.name).join(', ')}</div></div>
                <Menu.Item asChild><Link href="/profile" className="flex items-center gap-2 rounded-lg px-3 py-2 outline-none data-[highlighted]:bg-surface-2"><UserRound size={15} />My profile, attendance and leave</Link></Menu.Item>
                <Menu.Item onSelect={logout} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 outline-none data-[highlighted]:bg-surface-2"><LogOut size={15} />Sign out</Menu.Item>
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
        </header>
        <main className="min-w-0 flex-1 px-4 py-5 lg:px-7">{children}</main>
      </div>
      <FormDialog
        open={me.mustChangePassword} onClose={() => {}} title="Choose your own password" submitLabel="Save password" size="sm"
        intro={<p className="text-sm text-muted">Your account was created with a temporary password. Set a new one to continue.</p>}
        fields={[{ name: 'current', label: 'Temporary password', type: 'password', required: true, full: true }, { name: 'next', label: 'New password, at least 8 characters', type: 'password', required: true, full: true }]}
        onSubmit={async (v) => { await api('/auth/change-password', { body: v }); await reloadMe(); toast.success('Password saved') }}
      />
    </div>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider><Shell>{children}</Shell></AuthProvider>
}
