'use client'
// Search everywhere (Ctrl K or /) and the New menu (N, then a letter), in the top bar of every page.
import * as D from '@radix-ui/react-dialog'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { ArrowRight, Building2, FileText, FolderKanban, LifeBuoy, Plus, Receipt, Search, SquareCheckBig, UserPlus, Wallet, WalletCards } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Status, cn } from './ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { inr } from '@/lib/format'

type Item = { id: string; kind: string; title: string; sub?: string; status?: string; amount?: number; href: string }
const KIND_ICON: Record<string, any> = { customer: Building2, lead: UserPlus, invoice: Receipt, quotation: FileText, project: FolderKanban, ticket: LifeBuoy, task: SquareCheckBig, page: ArrowRight, action: Plus }

/** What the New menu can add, the letter that picks it, and where it opens. */
export const NEW_ITEMS: { key: string; label: string; module: string; href: string; icon: any }[] = [
  { key: 'L', label: 'Lead', module: 'LEADS', href: '/leads?new=lead', icon: UserPlus },
  { key: 'C', label: 'Customer', module: 'CUSTOMERS', href: '/customers?new=customer', icon: Building2 },
  { key: 'Q', label: 'Quotation', module: 'QUOTATIONS', href: '/quotations?new=quotation', icon: FileText },
  { key: 'I', label: 'Invoice', module: 'INVOICES', href: '/invoices?new=invoice', icon: Receipt },
  { key: 'P', label: 'Payment received', module: 'PAYMENTS', href: '/payments', icon: Wallet },
  { key: 'T', label: 'Task', module: 'TASKS', href: '/tasks?new=1', icon: SquareCheckBig },
  { key: 'K', label: 'Ticket', module: 'TICKETS', href: '/tickets?new=ticket', icon: LifeBuoy },
  { key: 'E', label: 'Expense', module: 'FINANCE', href: '/finance?tab=expenses&new=expense', icon: WalletCards },
]

/** Opens search everywhere from anywhere, such as the "Search or jump to" box in the menu. */
const OPEN_SEARCH = 'cx:open-search'
export const openSearch = () => window.dispatchEvent(new Event(OPEN_SEARCH))

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null
  return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
}

export function SearchEverywhere({ pages }: { pages: { path: string; label: string }[] }) {
  const router = useRouter()
  const { can } = useAuth()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [groups, setGroups] = useState<{ key: string; title: string; items: Item[] }[]>([])
  const [active, setActive] = useState(0)
  const seq = useRef(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(true) }
      else if (e.key === '/' && !typing(e)) { e.preventDefault(); setOpen(true) }
    }
    const show = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_SEARCH, show)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(OPEN_SEARCH, show) }
  }, [])
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setGroups([]); return }
    const id = ++seq.current
    const t = setTimeout(() => { api<{ groups: any[] }>(`/search?q=${encodeURIComponent(term)}`).then((r) => { if (id === seq.current) { setGroups(r.groups); setActive(0) } }).catch(() => {}) }, 180)
    return () => clearTimeout(t)
  }, [q])

  // pages to jump to and things to add, matched on the typed words
  const extra = useMemo(() => {
    const term = q.trim().toLowerCase()
    const jump: Item[] = pages.filter((p) => !term || p.label.toLowerCase().includes(term)).slice(0, term ? 4 : 6).map((p) => ({ id: p.path, kind: 'page', title: `Go to ${p.label}`, href: `/${p.path}` }))
    const add: Item[] = NEW_ITEMS.filter((n) => can(n.module, 'CREATE') && (!term || `new ${n.label}`.toLowerCase().includes(term) || n.label.toLowerCase().startsWith(term))).slice(0, term ? 3 : 0)
      .map((n) => ({ id: n.key, kind: 'action', title: `New ${n.label.toLowerCase()}`, href: n.href }))
    return [{ key: 'pages', title: 'Go to', items: jump }, { key: 'do', title: 'Do something', items: add }].filter((g) => g.items.length)
  }, [q, pages, can])
  const all = [...groups, ...extra]
  const flat = all.flatMap((g) => g.items)
  const go = (it?: Item) => { if (!it) return; setOpen(false); setQ(''); router.push(it.href) }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(flat[active]) }
  }
  let i = -1
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="glass hidden h-[38px] w-72 items-center gap-2 rounded-xl pr-2 pl-3 text-[13px] md:flex xl:w-[340px]">
        <Search size={16} className="opacity-80" /><span className="flex-1 text-left text-white/60">Search leads, customers, invoices</span><kbd className="rounded-md border border-white/70 bg-white/10 px-1.5 text-[11px] font-semibold text-white/60">/</kbd>
      </button>
      <button type="button" onClick={() => setOpen(true)} aria-label="Search" className="glass grid h-[38px] w-[38px] place-items-center rounded-xl md:hidden"><Search size={18} /></button>
      <D.Root open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQ('') }}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-black/45" />
          <D.Content aria-describedby={undefined} className="pop-in fixed top-[10vh] left-1/2 z-50 flex max-h-[75vh] w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
            <D.Title className="sr-only">Search everywhere</D.Title>
            <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
              <Search size={18} className="text-muted" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown} placeholder="Search names, numbers, phones, or type a page" className="h-8 flex-1 bg-transparent text-[15px] outline-none" aria-label="Search everywhere" />
              <kbd className="rounded border border-line px-1.5 text-[11px] text-muted">Esc</kbd>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {q.trim().length >= 2 && !groups.length && <p className="px-3 py-4 text-sm text-muted">No records match “{q.trim()}”.</p>}
              {all.map((g) => (
                <div key={g.key} className="mb-1">
                  <div className="px-3 pt-2 pb-1 text-xs text-muted">{g.title}</div>
                  {g.items.map((it) => {
                    i++
                    const idx = i
                    const Icon = KIND_ICON[it.kind] ?? ArrowRight
                    return (
                      <button key={`${it.kind}-${it.id}`} type="button" onMouseEnter={() => setActive(idx)} onClick={() => go(it)} className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left', idx === active && 'bg-accent-soft')}>
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted"><Icon size={16} /></span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{it.title}</span>{it.sub && <span className="block truncate text-xs text-muted">{it.sub}</span>}</span>
                        {it.amount !== undefined && <span className="num shrink-0 text-[13px] text-muted">{inr(it.amount)}</span>}
                        {it.status && <Status value={it.status} />}
                        {idx === active && <kbd className="hidden rounded border border-line px-1.5 text-[11px] text-muted sm:block">Enter</kbd>}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line bg-surface-2/60 px-4 py-2 text-[11px] text-muted">
              <span><kbd className="rounded border border-line px-1">Enter</kbd> Open</span><span><kbd className="rounded border border-line px-1">Up / Down</kbd> Move</span><span><kbd className="rounded border border-line px-1">Ctrl K</kbd> Open search from anywhere</span>
            </div>
          </D.Content>
        </D.Portal>
      </D.Root>
    </>
  )
}

export function NewMenu() {
  const router = useRouter()
  const { can } = useAuth()
  const items = NEW_ITEMS.filter((n) => can(n.module, 'CREATE'))
  const [open, setOpen] = useState(false)
  // N, then the letter, from any page
  useEffect(() => {
    let armed = 0
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.toUpperCase()
      if (Date.now() - armed < 1500) {
        const hit = items.find((n) => n.key === k)
        armed = 0
        if (hit) { e.preventDefault(); router.push(hit.href) }
      } else if (k === 'N') armed = Date.now()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items, router])
  if (!items.length) return null
  return (
    <Menu.Root open={open} onOpenChange={setOpen}>
      <Menu.Trigger className="btn-bright inline-flex h-9 items-center gap-2 rounded-xl px-3.5 text-sm font-medium"><Plus size={16} /><span className="hidden sm:inline">New</span></Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className="z-50 w-64 rounded-xl border border-line bg-surface p-1 text-sm shadow-xl">
          <div className="px-3 pt-2 pb-1 text-xs text-muted">What do you want to add?</div>
          {items.map((n) => (
            <Menu.Item key={n.key} onSelect={() => router.push(n.href)} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 outline-none data-[highlighted]:bg-accent-soft">
              <n.icon size={16} className="text-muted" /><span className="flex-1">{n.label}</span><kbd className="rounded border border-line px-1.5 text-[11px] text-muted">{n.key}</kbd>
            </Menu.Item>
          ))}
          <div className="mt-1 border-t border-line px-3 py-2 text-[11px] text-muted">Tip: press N, then the letter, from any page.</div>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
