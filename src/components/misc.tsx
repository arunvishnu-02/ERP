'use client'
import { Check } from 'lucide-react'
import { useState } from 'react'
import { inr, monthLabel } from '@/lib/format'
import { cn } from './ui'

export const STEPS = ['Lead', 'Follow-up', 'Quotation', 'Approval', 'Project', 'Invoice', 'Payment', 'Completion']
/** Where a deal stands on the path from lead to completion. `step` is the current step, counted from 0; 8 means finished. */
export function Workflow({ step }: { step: number }) {
  return (
    <ol className="flex w-full rounded-xl border border-line bg-surface px-2 py-3" aria-label="Workflow progress">
      {STEPS.map((s, i) => {
        const done = i < step
        const now = i === step
        return (
          <li key={s} className="relative min-w-0 flex-1 text-center" aria-current={now ? 'step' : undefined}>
            {i > 0 && <span className={cn('absolute top-3 right-1/2 -left-1/2 h-0.5', i <= step ? 'bg-accent' : 'bg-line')} />}
            <span className={cn('num relative z-10 mx-auto grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold', done ? 'bg-accent text-accent-ink' : now ? 'bg-surface text-accent ring-2 ring-accent' : 'bg-surface-2 text-muted')}>
              {done ? <Check size={13} strokeWidth={3} /> : i + 1}
            </span>
            <span className={cn('mt-1.5 block truncate px-0.5 text-[11.5px]', now ? 'font-semibold text-ink' : done ? 'text-ink' : 'text-muted')}>{s}</span>
          </li>
        )
      })}
    </ol>
  )
}

interface BoardProps<T> {
  columns: { key: string; label: string; meta?: string }[]
  items: T[]
  columnOf: (item: T) => string
  render: (item: T) => React.ReactNode
  onMove?: (item: T, to: string) => void
  onOpen?: (item: T) => void
}
/** Columns of cards. Cards can be dragged to another column when onMove is given. */
export function Board<T extends { id: string }>({ columns, items, columnOf, render, onMove, onOpen }: BoardProps<T>) {
  const [over, setOver] = useState<string | null>(null)
  return (
    <div className="grid auto-cols-[minmax(230px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
      {columns.map((c) => {
        const cards = items.filter((i) => columnOf(i) === c.key)
        return (
          <section
            key={c.key}
            onDragOver={onMove ? (e) => { e.preventDefault(); setOver(c.key) } : undefined}
            onDragLeave={() => setOver((o) => (o === c.key ? null : o))}
            onDrop={onMove ? (e) => { e.preventDefault(); setOver(null); const it = items.find((i) => i.id === e.dataTransfer.getData('text/plain')); if (it && columnOf(it) !== c.key) onMove(it, c.key) } : undefined}
            className={cn('flex min-h-32 flex-col gap-2 rounded-xl border border-line bg-surface-2/60 p-2', over === c.key && 'border-accent bg-accent-soft')}
          >
            <header className="flex items-baseline justify-between gap-2 px-1.5 pt-1">
              <h3 className="text-[13px] font-semibold">{c.label}</h3>
              <span className="num text-xs text-muted">{c.meta ?? cards.length}</span>
            </header>
            {cards.map((i) => (
              <article key={i.id} draggable={!!onMove} onDragStart={(e) => e.dataTransfer.setData('text/plain', i.id)} onClick={onOpen ? () => onOpen(i) : undefined} className={cn('rounded-lg border border-line bg-surface p-2.5 text-sm', onMove && 'cursor-grab active:cursor-grabbing', onOpen && 'hover:border-muted')}>
                {render(i)}
              </article>
            ))}
          </section>
        )
      })}
    </div>
  )
}

/** Two bars per month: billed against collected. */
export function PairBars({ data, second = 'collected', legend = true }: { data: { month: string; billed: number; collected: number; costs?: number }[]; second?: 'collected' | 'costs'; legend?: boolean }) {
  const name = second === 'costs' ? 'Costs' : 'Collected'
  const W = 600, H = 220, pl = 50, pr = 6, pt = 10, pb = 26
  const iw = W - pl - pr, ih = H - pt - pb
  const raw = Math.max(1, ...data.flatMap((d) => [d.billed, d[second] ?? 0])) / 4
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].find((m) => m * pow >= raw)! * pow
  const max = step * 4
  const y = (v: number) => pt + ih - (v / max) * ih
  const gw = iw / data.length
  const bw = Math.min(24, gw * 0.3)
  const tick = (v: number) => (v === 0 ? '0' : v >= 1e5 ? `₹${+(v / 1e5).toFixed(1)}L` : `₹${Math.round(v / 1e3)}k`)
  const bar = (x: number, v: number, cls: string, title: string) => {
    if (v <= 0) return null
    const top = y(v), base = pt + ih, r = Math.min(4, bw / 2, base - top)
    return <path className={cls} d={`M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${base}Z`}><title>{title}</title></path>
  }
  return (
    <div>
      {legend && <ChartLegend second={name} />}
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Billed and ${name.toLowerCase()} amounts by month`}>
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line x1={pl} x2={W - pr} y1={y(step * i)} y2={y(step * i)} className={i ? 'stroke-line' : 'stroke-muted'} strokeWidth={1} />
            <text x={pl - 8} y={y(step * i) + 3.5} textAnchor="end" className="fill-muted text-[10.5px]">{tick(step * i)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pl + gw * i + gw / 2
          return (
            <g key={d.month}>
              {bar(cx - bw - 1, d.billed, 'fill-chart-1', `${monthLabel(d.month)}: billed ${inr(d.billed)}`)}
              {bar(cx + 1, d[second] ?? 0, 'fill-chart-2', `${monthLabel(d.month)}: ${name.toLowerCase()} ${inr(d[second] ?? 0)}`)}
              <text x={cx} y={H - 8} textAnchor="middle" className="fill-muted text-[10.5px]">{monthLabel(d.month)}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export const ChartLegend = ({ second }: { second: string }) => (
  <div className="mb-1 flex gap-4 text-xs text-muted">
    <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-chart-1" />Billed</span>
    <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-chart-2" />{second}</span>
  </div>
)

/** Horizontal bars for comparing a handful of named values. */
export function HBars({ rows, empty = 'Nothing to show yet.' }: { rows: { label: string; value: number; text?: string }[]; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  if (!rows.length || rows.every((r) => !r.value)) return <p className="py-3 text-sm text-muted">{empty}</p>
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-[13px]">
          <span className="truncate">{r.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-chart-1" style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <span className="num text-muted">{r.text ?? r.value}</span>
        </div>
      ))}
    </div>
  )
}
