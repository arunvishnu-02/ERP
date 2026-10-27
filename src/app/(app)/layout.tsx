'use client'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { Bell, Building2, ChevronRight, Ellipsis, Inbox, ChartColumn, Search, FileText, Files, FolderKanban, Globe, Handshake, Landmark, Laptop, LayoutDashboard, LifeBuoy, LogOut, Megaphone, MenuIcon, MessagesSquare, PanelLeftClose, PanelLeftOpen, Moon, Receipt, Settings, SquareCheckBig, Sun, TrendingUp, UserPlus, UserRound, Users, Wallet, Zap } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { APP_NAME } from '@/lib/brand'
import { Mark } from '@/components/entry'
import { NewMenu, openSearch, SearchEverywhere } from '@/components/command'
import { FormDialog } from '@/components/form'
import { Avatar, Button, cn } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { AuthProvider, useAuth } from '@/lib/auth'
import { ago } from '@/lib/format'

const NAV: { group: string; fold?: boolean; items: [path: string, label: string, module: string, icon: any][] }[] = [
  { group: '', items: [['dashboard', 'Dashboard', 'DASHBOARD', LayoutDashboard], ['approvals', 'Approvals', '', Inbox]] },
  { group: 'Sales', items: [['leads', 'Leads', 'LEADS', UserPlus], ['customers', 'Customers', 'CUSTOMERS', Building2], ['sales', 'Sales pipeline', 'SALES', TrendingUp], ['quotations', 'Quotations', 'QUOTATIONS', FileText], ['invoices', 'Invoices', 'INVOICES', Receipt], ['payments', 'Payments', 'PAYMENTS', Wallet]] },
  { group: 'Delivery', items: [['projects', 'Projects', 'PROJECTS', FolderKanban], ['tasks', 'Tasks', 'TASKS', SquareCheckBig], ['marketing', 'Marketing', 'MARKETING', Megaphone], ['websites', 'Websites', 'WEBSITES', Globe], ['tickets', 'Tickets', 'TICKETS', LifeBuoy]] },
  { group: 'Back office', fold: true, items: [['documents', 'Documents', 'DOCUMENTS', Files], ['hr', 'HR', 'HR', Users], ['assets', 'Assets', 'ASSETS', Laptop], ['finance', 'Finance', 'FINANCE', Landmark]] },
  { group: 'System', fold: true, items: [['reports', 'Reports', 'REPORTS', ChartColumn], ['automation', 'Automation', 'AUTOMATION', Zap], ['communication', 'Communication', 'COMMUNICATION', MessagesSquare], ['settings', 'Settings', 'SETTINGS', Settings]] },
]
/** The line under each page title. */
const SUBTITLES: Record<string, string> = {
  approvals: 'Quotations, expenses and leave waiting for your decision.',
  leads: 'Every enquiry, its next follow-up and who owns it.',
  customers: 'Clients, their contacts and everything you have done for them.',
  sales: 'Deals by stage, meetings and calls.',
  quotations: 'Prepare, approve and send quotations.',
  invoices: 'Bills you have sent and what is still to collect.',
  payments: 'Money received, by customer and bank account.',
  projects: 'Work in progress, milestones and who is on each project.',
  tasks: 'What everyone is doing, and the time they log.',
  marketing: 'Campaigns, content and ad spend for clients.',
  websites: 'Client websites, domains, hosting and renewals.',
  tickets: 'Client support requests and replies.',
  documents: 'Letters, agreements and company files.',
  hr: 'People, attendance, leave, payroll and hiring.',
  assets: 'Laptops and equipment, and who has them.',
  finance: 'Expenses, vendors, bank accounts and profit.',
  reports: 'Sales, collections and team performance.',
  automation: 'Rules that send reminders and do routine work.',
  communication: 'Emails and messages sent from the app.',
  settings: 'Company details, people, permissions and connected apps.',
  profile: 'Your details, attendance, leave and payslips.',
}
const TITLES: Record<string, string> = Object.fromEntries([...NAV.flatMap((g) => g.items.map(([p, l]) => [p, l])), ['profile', 'My profile']])

function Notifications() {
  const router = useRouter()
  const { data, reload } = useApi<{ items: any[]; unread: number }>('/notifications')
  useEffect(() => { const t = setInterval(reload, 20_000); return () => clearInterval(t) }, [reload])
  const read = async (ids?: string[]) => { await api('/notifications/read', { body: ids ? { ids } : {} }).catch(() => {}); reload() }
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <button type="button" aria-label={`Notifications, ${data?.unread ?? 0} unread`} className="glass relative grid h-[42px] w-[42px] place-items-center rounded-xl">
          <Bell size={18} />
          {!!data?.unread && <span className="num absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full border-2 border-bg bg-bad px-1 text-[10px] font-semibold text-white">{data.unread > 9 ? '9+' : data.unread}</span>}
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className="z-50 max-h-[70vh] w-80 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-xl">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="font-display text-[15px] font-semibold">Notifications</span>
            {!!data?.unread && <button className="text-xs text-accent-strong hover:underline" onClick={() => read()}>Mark all as read</button>}
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

/** How many requests wait for this person's decision, refreshed with the notifications. */
function useApprovalCount() {
  const { data, reload } = useApi<{ count: number }>('/approvals/count')
  useEffect(() => { const t = setInterval(reload, 60_000); return () => clearInterval(t) }, [reload])
  return data?.count ?? 0
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'
  return <button type="button" className="glass grid h-[42px] w-[42px] place-items-center rounded-xl" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setTheme(dark ? 'light' : 'dark')}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
}

function NavLink({ path, label, Icon, active, onClick, badge, slim }: { path: string; label: string; Icon: any; active: boolean; onClick: () => void; badge?: number; slim?: boolean }) {
  return (
    <Link href={`/${path}`} onClick={onClick} title={slim ? label : undefined} aria-current={active ? 'page' : undefined} className={cn('relative flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm text-rail-ink hover:bg-white/5 hover:text-white', active && 'bg-rail-active font-medium text-white hover:bg-rail-active', slim && 'lg:justify-center lg:px-0')}>
      {active && <span aria-hidden className="absolute top-2.5 bottom-2.5 left-1.5 w-1 rounded-full bg-accent" />}
      <Icon size={slim ? 18 : 16} className={cn('shrink-0', active ? 'text-white' : 'text-rail-mute')} /><span className={cn(slim && 'lg:sr-only')}>{label}</span>
      {!!badge && <span className={cn('num ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-bad px-1.5 text-[11px] font-semibold text-white', slim && 'lg:absolute lg:top-0 lg:right-0.5 lg:h-4 lg:min-w-4 lg:px-1 lg:text-[10px]')}>{badge > 99 ? '99+' : badge}</span>}
    </Link>
  )
}

/** "Good morning, Arun" on the dashboard, by the time of day. */
const greeting = (name: string) => { const h = new Date().getHours(); return `Good ${h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'}, ${name.split(' ')[0]}` }

function Shell({ children }: { children: React.ReactNode }) {
  const { me, can, logout, lookups, reloadMe } = useAuth()
  const key = usePathname().split('/')[1] || 'dashboard'
  const [open, setOpen] = useState(false)
  // On a computer the side menu can shrink to icons only for more room; the choice is remembered on this browser.
  const [hidden, setHidden] = useState(false)
  useEffect(() => { try { setHidden(localStorage.getItem('cx-rail') === 'hidden') } catch {} }, [])
  const toggleRail = () => setHidden((h) => { try { localStorage.setItem('cx-rail', h ? 'shown' : 'hidden') } catch {} return !h })
  const [unfold, setUnfold] = useState<Record<string, boolean>>({})
  const waiting = useApprovalCount()
  useEffect(() => { document.title = `${TITLES[key] ?? APP_NAME} | ${APP_NAME}` }, [key])
  const month = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const subtitle = key === 'dashboard' ? `${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${me.roles[0]?.name ?? 'Your'} view of ${month}` : SUBTITLES[key]
  const tall = key === 'dashboard'
  return (
    <div className={cn('min-h-screen lg:grid', hidden ? 'lg:grid-cols-[80px_minmax(0,1fr)]' : 'lg:grid-cols-[256px_minmax(0,1fr)]')}>
      <aside className={cn('app-rail fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-y-auto px-4 pt-6 pb-4 text-rail-ink transition-transform duration-150 lg:sticky lg:top-0 lg:h-screen lg:w-auto lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full', hidden && 'lg:px-3')} aria-label="Modules">
        <div className={cn('flex items-center gap-2.5', hidden && 'lg:justify-center')}>
          <Mark />
          <span className={cn('min-w-0', hidden && 'lg:hidden')}><span className="block text-[13px] leading-5 font-semibold tracking-[0.22em] text-white uppercase">One X System</span><span className="block truncate text-xs text-rail-mute">{lookups.organization.name}</span></span>
        </div>
        <button type="button" onClick={() => { setOpen(false); openSearch() }} title={hidden ? 'Search' : undefined} aria-label="Search or jump to" className={cn('mt-6 flex h-10 w-full shrink-0 items-center gap-2 rounded-[10px] bg-rail-active pr-2 pl-2.5 text-[13px] text-rail-mute hover:text-rail-ink', hidden && 'lg:justify-center lg:px-0')}>
          <Search size={16} className="shrink-0 text-rail-ink" /><span className={cn('flex-1 text-left', hidden && 'lg:hidden')}>Search or jump to</span><kbd className={cn('rounded-md bg-rail px-1.5 py-0.5 text-[11px] font-semibold', hidden && 'lg:hidden')}>Ctrl K</kbd>
        </button>
        <nav className="mt-5 flex-1 space-y-4">
          {NAV.map((g) => {
            const items = g.items.filter(([, , module]) => !module || can(module))
            if (!items.length) return null
            const here = items.some(([path]) => path === key)
            const shown = !g.fold || here || unfold[g.group] || hidden
            return (
              <div key={g.group || 'home'}>
                {g.group && (g.fold ? (
                  <button type="button" aria-expanded={shown} onClick={() => setUnfold((u) => ({ ...u, [g.group]: !shown }))} className={cn('flex h-8 w-full items-center px-2.5 text-xs text-rail-mute hover:text-rail-ink', hidden && 'lg:hidden')}>
                    <span className="flex-1 text-left">{g.group}</span><span className="num mr-2">{items.length}</span><ChevronRight size={14} className={cn('transition-transform', shown && 'rotate-90')} />
                  </button>
                ) : <div className={cn('px-2.5 pb-1 text-xs text-rail-mute', hidden && 'lg:hidden')}>{g.group}</div>)}
                {g.group && hidden && <div aria-hidden className="mx-3 mb-2 hidden h-px bg-white/10 lg:block" />}
                {shown && items.map(([path, label, , Icon]) => <NavLink key={path} path={path} label={label} Icon={Icon} active={key === path} onClick={() => setOpen(false)} badge={path === 'approvals' ? waiting : undefined} slim={hidden} />)}
              </div>
            )
          })}
        </nav>
        <Menu.Root>
          <Menu.Trigger title={hidden ? me.name : undefined} className={cn('mt-4 flex w-full shrink-0 items-center gap-3 rounded-xl bg-rail-active p-3 text-left', hidden && 'lg:justify-center lg:p-2')}>
            <Avatar name={me.name} className="h-9 w-9 bg-accent text-[12px] text-accent-ink ring-0" />
            <span className={cn('min-w-0 flex-1', hidden && 'lg:hidden')}><span className="block truncate text-[13px] font-medium text-white">{me.name}</span><span className="block truncate text-xs text-rail-mute">{me.roles.map((r) => r.name).join(', ')}</span></span>
            <Ellipsis size={16} className={cn('text-rail-mute', hidden && 'lg:hidden')} />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content side="top" align="start" sideOffset={8} className="z-50 w-60 rounded-xl border border-line bg-surface p-1 text-sm shadow-xl">
              <Menu.Item asChild><Link href="/profile" className="flex items-center gap-2 rounded-lg px-3 py-2 outline-none data-[highlighted]:bg-surface-2"><UserRound size={15} />My profile, attendance and leave</Link></Menu.Item>
              <Menu.Item onSelect={logout} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 outline-none data-[highlighted]:bg-surface-2"><LogOut size={15} />Sign out</Menu.Item>
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="relative flex min-w-0 flex-col">
        <header className="relative z-20 flex shrink-0 items-center gap-3 px-4 pt-6 pb-4 lg:px-8 lg:pt-8">
          <button type="button" className="glass grid h-[42px] w-[42px] place-items-center rounded-xl lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><MenuIcon size={18} /></button>
          <button type="button" className="glass hidden h-[42px] w-[42px] shrink-0 place-items-center rounded-xl lg:grid" aria-label={hidden ? 'Show full side menu' : 'Show icons only'} title={hidden ? 'Show full side menu' : 'Show icons only'} onClick={toggleRail}>{hidden ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-[22px] leading-8 font-bold tracking-tight lg:text-[28px] lg:leading-9">{tall ? greeting(me.name) : TITLES[key] ?? APP_NAME}</h1>
            {subtitle && <p className="mt-0.5 hidden truncate font-serif text-[15px] text-muted sm:block">{subtitle}</p>}
          </div>
          <SearchEverywhere pages={NAV.flatMap((g) => g.items.filter(([, , module]) => !module || can(module)).map(([path, label]) => ({ path, label })))} />
          <NewMenu />
          <Notifications />
          <ThemeToggle />
          <Link href="/profile" aria-label="My profile" className="hidden sm:block"><Avatar name={me.name} className="h-[42px] w-[42px] text-[13px] ring-1 ring-line" /></Link>
        </header>
        <main className="relative min-w-0 flex-1 px-4 pt-2 pb-10 lg:px-8">{children}</main>
      </div>
      <FormDialog
        open={me.mustChangePassword} onClose={() => {}} title="Choose your own password" submitLabel="Save password" size="sm"
        intro={<p className="text-sm text-muted">Your account was created with a temporary password. Set a new one to continue.</p>}
        fields={[{ name: 'current', label: 'Temporary password', type: 'password', required: true, full: true }, { name: 'next', label: 'New password, at least 8 characters', type: 'password', required: true, full: true }, { name: 'again', label: 'Type the new password again', type: 'password', required: true, full: true }]}
        onSubmit={async (v) => { if (v.next !== v.again) throw new Error('The two new passwords do not match'); await api('/auth/change-password', { body: { current: v.current, next: v.next } }); await reloadMe(); toast.success('Password saved') }}
      />
    </div>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider><Shell>{children}</Shell></AuthProvider>
}
