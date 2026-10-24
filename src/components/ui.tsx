'use client'
import * as D from '@radix-ui/react-dialog'
import { clsx, type ClassValue } from 'clsx'
import { Loader2, X } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { human, initials, toneOf, type Tone } from '@/lib/format'

export const cn = (...a: ClassValue[]) => twMerge(clsx(a))

const BTN = {
  primary: 'btn-primary',
  bright: 'btn-bright',
  secondary: 'border border-line bg-surface text-ink hover:bg-surface-2',
  ghost: 'text-muted hover:bg-surface-2 hover:text-ink',
  danger: 'border border-bad/40 bg-surface text-bad hover:bg-bad-soft',
  link: 'h-auto px-0 text-accent hover:underline',
}
const BTN_SIZE = { md: 'h-9 rounded-[10px] px-3.5 text-sm', sm: 'h-7 rounded-md px-2.5 text-[13px]', icon: 'h-8 w-8 rounded-lg' }
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BTN; size?: keyof typeof BTN_SIZE; loading?: boolean }
export function Button({ variant = 'secondary', size = 'md', loading, className, children, disabled, type = 'button', ...p }: ButtonProps) {
  return (
    <button type={type} disabled={disabled || loading} className={cn('inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50', BTN_SIZE[size], BTN[variant], className)} {...p}>
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  )
}

const CONTROL = 'w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted/60 focus:outline-2 focus:-outline-offset-1 focus:outline-accent disabled:opacity-60'
export const Input = ({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement>) => <input className={cn(CONTROL, 'h-9', className)} {...p} />
export const Textarea = ({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} className={cn(CONTROL, 'py-2', className)} {...p} />
export const Select = ({ className, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className={cn(CONTROL, 'h-9 pr-8', className)} {...p}>{children}</select>
)
export function Field({ label, error, help, children, className, group }: { label: string; error?: string; help?: string; children: React.ReactNode; className?: string; group?: boolean }) {
  const body = (
    <>
      <span className="text-[13px] font-medium text-muted">{label}</span>
      {children}
      {error ? <span className="text-xs text-bad">{error}</span> : help ? <span className="text-xs text-muted">{help}</span> : null}
    </>
  )
  // A set of buttons is a group, not one control, so it must not sit inside a <label>.
  return group ? <div role="group" aria-label={label} className={cn('flex min-w-0 flex-col gap-1', className)}>{body}</div> : <label className={cn('flex min-w-0 flex-col gap-1', className)}>{body}</label>
}

const TONE: Record<Tone, string> = { good: 'bg-good-soft text-good', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad', info: 'bg-info-soft text-info', accent: 'bg-accent-soft text-accent', mute: 'bg-surface-2 text-muted' }
export function Badge({ tone = 'mute', children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', TONE[tone], className)}><span className="h-1.5 w-1.5 rounded-full bg-current" />{children}</span>
}
export const Status = ({ value, label }: { value?: string | null; label?: string }) => (value ? <Badge tone={toneOf(value)}>{label ?? human(value)}</Badge> : null)

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('card-shadow rounded-[20px] border border-line/60 bg-surface dark:border-line', className)} {...p} />
export function Panel({ title, action, children, className, flush }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; flush?: boolean }) {
  return (
    <Card className={cn('min-w-0', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-2.5">
        <h3 className="font-display text-base font-semibold tracking-tight">{title}</h3>
        {action}
      </div>
      <div className={flush ? '' : 'px-5 pb-5'}>{children}</div>
    </Card>
  )
}

const SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }
interface DialogProps { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; size?: keyof typeof SIZES }
export function Dialog({ open, onClose, title, children, footer, size = 'md' }: DialogProps) {
  return (
    <D.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/45" />
        <D.Content aria-describedby={undefined} className={cn('pop-in fixed top-[5vh] left-1/2 z-50 flex max-h-[90vh] w-[calc(100%-1.5rem)] -translate-x-1/2 flex-col rounded-[20px] border border-line bg-surface shadow-2xl', SIZES[size])}>
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
            <D.Title className="font-display text-[17px] font-semibold">{title}</D.Title>
            <D.Close className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close"><X size={18} /></D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 rounded-b-[20px] border-t border-line bg-surface-2/50 px-5 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
/** A wide panel that slides in from the right, for one record and everything attached to it. */
export function Sheet({ open, onClose, title, subtitle, children, actions }: { open: boolean; onClose: () => void; title: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <D.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <D.Content aria-describedby={undefined} className="sheet-in fixed inset-y-0 right-0 z-50 flex w-full max-w-3xl flex-col border-l border-line bg-bg shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-line bg-surface px-5 py-3.5">
            <div className="min-w-0">
              <D.Title className="truncate font-display text-lg font-semibold">{title}</D.Title>
              {subtitle && <div className="mt-0.5 text-[13px] text-muted">{subtitle}</div>}
            </div>
            <D.Close className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close"><X size={18} /></D.Close>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">{children}</div>
          {actions && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface px-5 py-3">{actions}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

export interface TabOption { value: string; label: string; count?: number }
export function Tabs({ value, onChange, options, className }: { value: string; onChange: (v: string) => void; options: TabOption[]; className?: string }) {
  return (
    <div role="tablist" className={cn('flex max-w-full gap-x-6 overflow-x-auto border-b border-line', className)}>
      {options.map((o) => (
        <button key={o.value} role="tab" type="button" aria-selected={o.value === value} onClick={() => onChange(o.value)} className={cn('-mb-px flex shrink-0 items-center gap-2 border-b-2 pt-2.5 pb-3 text-sm font-medium whitespace-nowrap', o.value === value ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink')}>
          {o.label}
          {o.count !== undefined && <span className={cn('num rounded-full px-[7px] py-px text-xs', o.value === value ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted')}>{o.count}</span>}
        </button>
      ))}
    </div>
  )
}
export function Chips({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: TabOption[] }) {
  return (
    <div className="inline-flex max-w-full flex-wrap gap-0.5 rounded-[10px] bg-surface-2 p-[3px]">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)} className={cn('rounded-md px-3 py-1.5 text-[13px] font-medium', o.value === value ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(15,28,43,0.08)]' : 'text-muted hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export const Table = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className="overflow-x-auto"><table className={cn('w-full border-collapse text-sm', className)}>{children}</table></div>
)
export const Th = ({ className, right, ...p }: React.ThHTMLAttributes<HTMLTableCellElement> & { right?: boolean }) => (
  <th className={cn('border-b border-line px-3 py-3 text-xs font-medium whitespace-nowrap text-muted first:pl-5 last:pr-5', right ? 'text-right' : 'text-left', className)} {...p} />
)
export const Td = ({ className, right, ...p }: React.TdHTMLAttributes<HTMLTableCellElement> & { right?: boolean }) => (
  <td className={cn('border-b border-line/70 px-3 py-3 align-middle first:pl-5 last:pr-5', right && 'num text-right whitespace-nowrap', className)} {...p} />
)

export const Empty = ({ children }: { children: React.ReactNode }) => <div className="px-4 py-10 text-center text-sm text-muted">{children}</div>
export const Loading = () => <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted"><Loader2 size={16} className="animate-spin" />Loading…</div>
export const Avatar = ({ name, className }: { name: string; className?: string }) => (
  <span title={name} className={cn('inline-grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[10px] font-semibold text-accent ring-1 ring-surface', className)}>{initials(name) || '?'}</span>
)
export const Progress = ({ value, hot }: { value: number; hot?: boolean }) => (
  <div className="h-1.5 w-full min-w-16 overflow-hidden rounded-full bg-surface-2"><div className={cn('h-full rounded-full', hot ? 'bg-bad' : 'bg-chart-1')} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
)
export const Two = ({ top, bottom }: { top: React.ReactNode; bottom?: React.ReactNode }) => (
  <div className="min-w-0"><div className="truncate font-medium">{top}</div>{bottom ? <div className="truncate text-xs text-muted">{bottom}</div> : null}</div>
)
export function KV({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-1.5 text-sm">
      {rows.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => (
        <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="min-w-0">{v}</dd></div>
      ))}
    </dl>
  )
}
/** A row of figures in one band with dividers, used at the top of dashboards and summaries. */
export function StatBand({ items }: { items: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: 'good' | 'bad'; href?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:flex lg:gap-4">
      {items.map((s) => {
        const body = (
          <>
            <div className="text-[13px] text-muted">{s.label}</div>
            <div className={cn('num mt-1.5 font-display text-[26px] leading-8 font-semibold tracking-tight', s.tone === 'good' && 'text-good', s.tone === 'bad' && 'text-bad')}>{s.value}</div>
            {s.hint && <div className="mt-1.5 text-xs text-muted">{s.hint}</div>}
          </>
        )
        const cls = 'card-shadow min-w-0 flex-1 rounded-[20px] border border-line/60 bg-surface px-5 py-4 dark:border-line'
        return s.href ? <a key={s.label} href={s.href} className={cn(cls, 'hover:border-accent/40')}>{body}</a> : <div key={s.label} className={cls}>{body}</div>
      })}
    </div>
  )
}
