'use client'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog, FormDialog } from '@/components/form'
import { Button, Card, cn, Empty, Loading, Panel } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { todayStr } from '@/lib/format'

type Kind = 'task' | 'meeting' | 'deadline' | 'followup' | 'renewal' | 'birthday' | 'leave' | 'holiday' | 'payroll' | 'invoice' | 'event'
interface Item { id: string; kind: Kind; date: string; end?: string; time?: string; title: string; sub?: string; link?: string; mine?: boolean; shared?: boolean; notes?: string | null }

/** Filter groups, as in the design: each chip turns a set of kinds on or off. */
const GROUPS: { key: string; label: string; kinds: Kind[]; dot: string; admin?: boolean }[] = [
  { key: 'tasks', label: 'Tasks', kinds: ['task'], dot: 'bg-[#8fb43a]' },
  { key: 'meetings', label: 'Meetings and events', kinds: ['meeting', 'event'], dot: 'bg-[#6a9bcc]' },
  { key: 'deadlines', label: 'Deadlines', kinds: ['deadline', 'followup', 'renewal'], dot: 'bg-[#d97757]' },
  { key: 'people', label: 'Birthdays and leave', kinds: ['birthday', 'leave', 'holiday'], dot: 'bg-[#a58fd0]' },
  { key: 'finance', label: 'Finance', kinds: ['payroll', 'invoice'], dot: 'bg-ink', admin: true },
]
const dotOf = (k: Kind) => GROUPS.find((g) => g.kinds.includes(k))!.dot
const groupOf = (k: Kind) => GROUPS.find((g) => g.kinds.includes(k))!.key
const KIND_LABEL: Record<Kind, string> = { task: 'Task due', meeting: 'Meeting', deadline: 'Deadline', followup: 'Lead follow-up', renewal: 'Renewal', birthday: 'Birthday', leave: 'Leave', holiday: 'Holiday', payroll: 'Salary', invoice: 'Payment due', event: 'Event' }
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const iso = (d: Date) => d.toISOString().slice(0, 10)
const at = (s: string) => new Date(`${s}T00:00:00Z`)
const plus = (s: string, n: number) => iso(new Date(at(s).getTime() + n * 864e5))
const monthTitle = (ym: string) => at(`${ym}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayTitle = (s: string) => at(s).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const shortDay = (s: string) => at(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const shiftMonth = (ym: string, n: number) => { const d = at(`${ym}-01`); d.setUTCMonth(d.getUTCMonth() + n); return iso(d).slice(0, 7) }
const time12 = (t?: string) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}` }

function ItemRow({ item, onOpen }: { item: Item; onOpen: (i: Item) => void }) {
  const clickable = item.mine || item.link
  return (
    <li>
      <button type="button" disabled={!clickable} onClick={() => onOpen(item)} className={cn('flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left', clickable && 'hover:bg-surface-2')}>
        <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', dotOf(item.kind))} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{item.title}</span>
          <span className="block truncate font-serif text-[13px] text-muted">{[item.time ? time12(item.time) : null, KIND_LABEL[item.kind], item.sub].filter(Boolean).join(' · ')}</span>
        </span>
      </button>
    </li>
  )
}

export default function Calendar() {
  const router = useRouter()
  const today = todayStr()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [picked, setPicked] = useState(today)
  const [off, setOff] = useState<string[]>([])
  const [edit, setEdit] = useState<Partial<Item> | null>(null)
  const [remove, setRemove] = useState<Item | null>(null)

  // The grid runs Monday to Sunday, from the week of the 1st to the week of the last day.
  const first = `${month}-01`
  const start = plus(first, -((at(first).getUTCDay() + 6) % 7))
  const last = plus(`${shiftMonth(month, 1)}-01`, -1)
  const end = plus(last, 6 - ((at(last).getUTCDay() + 6) % 7))
  const days = useMemo(() => { const out: string[] = []; for (let d = start; d <= end; d = plus(d, 1)) out.push(d); return out }, [start, end])
  const { data, reload } = useApi<{ items: Item[]; canShare: boolean; finance: boolean }>(`/calendar?from=${start}&to=${end}`)

  const groups = GROUPS.filter((g) => !g.admin || data?.finance)
  const visible = (data?.items ?? []).filter((i) => !off.includes(groupOf(i.kind)))
  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>()
    for (const i of visible) {
      // leave covers every day from its start to its end
      for (let d = i.date < start ? start : i.date; d <= (i.end && i.end < end ? i.end : i.end ? end : i.date); d = plus(d, 1)) {
        if (!m.has(d)) m.set(d, [])
        m.get(d)!.push(i)
      }
    }
    return m
  }, [visible, start, end])
  const dayItems = byDay.get(picked) ?? []
  const coming = visible.filter((i) => i.date > picked).slice(0, 6)

  const open = (i: Item) => {
    if (i.kind === 'event' && i.mine) setEdit(i)
    else if (i.link) router.push(i.link)
  }
  const goMonth = (n: number) => { const m = shiftMonth(month, n); setMonth(m); setPicked(m === today.slice(0, 7) ? today : `${m}-01`) }
  const goToday = () => { setMonth(today.slice(0, 7)); setPicked(today) }
  const toggle = (k: string) => setOff((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]))
  const eventId = (i: Partial<Item>) => i.id?.replace(/^event-/, '')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={() => goMonth(-1)} aria-label="Previous month"><ChevronLeft size={16} /></Button>
          <Button size="sm" onClick={() => goMonth(1)} aria-label="Next month"><ChevronRight size={16} /></Button>
        </div>
        <h2 className="text-xl font-semibold">{monthTitle(month)}</h2>
        <Button size="sm" onClick={goToday}>Today</Button>
        <div className="ml-auto"><Button variant="primary" onClick={() => setEdit({ date: picked })}><Plus size={15} />Add event</Button></div>
      </div>

      <div className="flex flex-wrap gap-2">
        {groups.map((g) => {
          const on = !off.includes(g.key)
          return (
            <button key={g.key} type="button" aria-pressed={on} onClick={() => toggle(g.key)} className={cn('flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium', on ? 'border-line bg-surface text-ink' : 'border-transparent bg-surface-2 text-muted line-through')}>
              <span className={cn('size-2 rounded-full', g.dot, !on && 'opacity-40')} />{g.label}
            </button>
          )
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line bg-surface-2/60">
            {WEEK.map((w) => <div key={w} className="px-2 py-2.5 text-center text-xs font-semibold tracking-wide text-muted uppercase">{w}</div>)}
          </div>
          {!data ? <Loading /> : (
            <div className="grid grid-cols-7">
              {days.map((d, n) => {
                const list = byDay.get(d) ?? []
                const out = d.slice(0, 7) !== month
                return (
                  <button key={d} type="button" onClick={() => setPicked(d)} aria-label={`${dayTitle(d)}, ${list.length} item${list.length === 1 ? '' : 's'}`}
                    className={cn('flex min-h-[76px] flex-col gap-1 border-line p-1.5 text-left align-top sm:min-h-[112px] sm:p-2', n % 7 !== 6 && 'border-r', n < days.length - 7 && 'border-b', out && 'bg-surface-2/40', d === picked && 'bg-accent-soft/60 ring-2 ring-accent-strong ring-inset')}>
                    <span className={cn('num flex size-7 items-center justify-center rounded-full text-[13px] font-medium', out && 'text-muted', d === today && 'bg-accent font-semibold text-accent-ink')}>{Number(d.slice(8))}</span>
                    <span className="hidden flex-col gap-1 sm:flex">
                      {list.slice(0, 3).map((i) => (
                        <span key={i.id} className="flex items-center gap-1.5 truncate rounded-md bg-surface-2 px-1.5 py-0.5 text-[11.5px] leading-tight">
                          <span className={cn('size-1.5 shrink-0 rounded-full', dotOf(i.kind))} /><span className="truncate">{i.time ? `${time12(i.time)} ` : ''}{i.title}</span>
                        </span>
                      ))}
                      {list.length > 3 && <span className="px-1.5 text-[11.5px] font-medium text-muted">+{list.length - 3} more</span>}
                    </span>
                    {!!list.length && <span className="flex flex-wrap gap-0.5 sm:hidden">{list.slice(0, 4).map((i) => <span key={i.id} className={cn('size-1.5 rounded-full', dotOf(i.kind))} />)}</span>}
                  </button>
                )
              })}
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Panel title={picked === today ? `Today, ${shortDay(picked)}` : dayTitle(picked)} flush>
            {!dayItems.length ? <Empty>Nothing on this day.</Empty> : <ul className="p-2">{dayItems.map((i) => <ItemRow key={i.id} item={i} onOpen={open} />)}</ul>}
          </Panel>
          <Panel title="Coming up" flush>
            {!coming.length ? <Empty>Nothing else this month.</Empty> : (
              <ul className="p-2">{coming.map((i) => (
                <li key={i.id} className="flex items-center gap-1">
                  <span className="num w-[70px] shrink-0 pl-3 text-xs font-medium text-muted">{shortDay(i.date).replace(/^\w+,?\s/, '')}</span>
                  <div className="min-w-0 flex-1"><ul><ItemRow item={i} onOpen={open} /></ul></div>
                </li>
              ))}</ul>
            )}
          </Panel>
        </div>
      </div>

      <FormDialog open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit event' : 'Add event'} submitLabel={edit?.id ? 'Save' : 'Add event'}
        initial={{ title: edit?.title ?? '', date: edit?.date ?? picked, time: edit?.time ?? '', notes: edit?.notes ?? '', shared: !!edit?.shared }}
        fields={[
          { name: 'title', label: 'Event', required: true, full: true, placeholder: 'Team meeting, client visit, office outing' },
          { name: 'date', label: 'Date', type: 'date', required: true },
          { name: 'time', label: 'Time (optional)', placeholder: '14:30', help: '24-hour time. Leave empty for all day' },
          { name: 'notes', label: 'Notes', type: 'textarea' },
          ...(data?.canShare ? [{ name: 'shared', label: 'Show to everyone in the company', type: 'checkbox' as const, full: true }] : []),
        ]}
        extra={edit?.id ? <button type="button" className="text-sm font-medium text-[#b42318] hover:underline" onClick={() => { setRemove(edit as Item); setEdit(null) }}>Delete this event</button> : undefined}
        onSubmit={async (v) => {
          const body = { ...v, shared: data?.canShare ? v.shared : undefined }
          if (edit?.id) await api(`/calendar/events/${eventId(edit)}`, { method: 'PUT', body })
          else await api('/calendar/events', { body })
          toast.success(edit?.id ? 'Event saved' : 'Event added')
          setPicked(v.date)
          if (v.date.slice(0, 7) !== month) setMonth(v.date.slice(0, 7))
          reload()
        }} />
      <ConfirmDialog open={!!remove} onClose={() => setRemove(null)} title="Delete this event?" confirmLabel="Delete" danger
        onConfirm={async () => { await api(`/calendar/events/${eventId(remove!)}`, { method: 'DELETE' }); toast.success('Event deleted'); reload() }}>
        {remove?.title} on {remove ? dayTitle(remove.date) : ''} will be removed.
      </ConfirmDialog>
    </div>
  )
}
