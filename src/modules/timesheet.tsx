'use client'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { FormDialog, type Field } from '@/components/form'
import { Button, Card, Panel, Table, Tabs, Td, Th } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { fmtShort, personName, plusDays, todayStr } from '@/lib/format'
import { act } from './common'

const hrs = (m: number) => (m ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` : '')
const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function Timesheet({ projects }: { projects: any[] }) {
  const { can, me } = useAuth()
  const [week, setWeek] = useState(todayStr())
  const [who, setWho] = useState('me')
  const [add, setAdd] = useState<string | null>(null)
  const { data, reload } = useApi<{ days: string[]; items: any[]; total: number; canTeam: boolean }>(`/tasks/timesheet?week=${week}&who=${who === 'team' ? 'team' : 'me'}`)
  const tasks = useApi<{ items: any[] }>('/tasks?limit=500&mine=1').data?.items ?? []
  const days = data?.days ?? []
  const team = who === 'team'

  // one row per person + task (or project, or general work)
  const rows = new Map<string, { label: string; sub: string; per: Record<string, number>; total: number }>()
  for (const e of data?.items ?? []) {
    const key = `${team ? e.userId : ''}|${e.taskId ?? e.projectId ?? ''}`
    const label = e.task?.title ?? e.project?.name ?? 'General work'
    const sub = [team ? personName(e.user) : '', e.task && e.project ? e.project.name : ''].filter(Boolean).join(', ')
    const r = rows.get(key) ?? { label, sub, per: {}, total: 0 }
    r.per[e.day] = (r.per[e.day] ?? 0) + e.minutes
    r.total += e.minutes
    rows.set(key, r)
  }
  const dayTotal = (d: string) => (data?.items ?? []).filter((e) => e.day === d).reduce((a, e) => a + e.minutes, 0)
  const thisWeek = days.includes(todayStr())

  const fields: Field[] = [
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'hours', label: 'Hours worked', type: 'number', required: true, help: 'For example 1.5 for one and a half hours' },
    { name: 'taskId', label: 'Task', type: 'select', options: tasks.filter((t) => t.status !== 'CANCELLED').map((t) => ({ value: t.id, label: t.title })), placeholder: 'No task' },
    { name: 'projectId', label: 'Project', type: 'select', options: projects.map((p) => ({ value: p.id, label: p.name })), placeholder: 'No project', help: 'Used only when no task is picked' },
    { name: 'description', label: 'What was done', type: 'textarea' },
    { name: 'isBillable', label: 'Billable to the client', type: 'checkbox' },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button aria-label="Previous week" onClick={() => setWeek(plusDays(-7, days[0] ?? week))}><ChevronLeft size={16} /></Button>
          <span className="min-w-36 text-center text-sm font-medium">{days.length ? `${fmtShort(days[0])} to ${fmtShort(days[6])}` : ''}</span>
          <Button aria-label="Next week" disabled={thisWeek} onClick={() => setWeek(plusDays(7, days[0] ?? week))}><ChevronRight size={16} /></Button>
          {!thisWeek && <Button onClick={() => setWeek(todayStr())}>This week</Button>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data?.canTeam && <Tabs value={who} onChange={setWho} options={[{ value: 'me', label: 'My time' }, { value: 'team', label: 'Team' }]} />}
          {can('TASKS', 'EDIT') && <Button variant="primary" onClick={() => setAdd(thisWeek ? todayStr() : days[0])}><Plus size={16} />Add time</Button>}
        </div>
      </div>

      <Card className="overflow-x-auto">
        <Table>
          <thead><tr><Th>{team ? 'Person and work' : 'Work'}</Th>{days.map((d, i) => <Th key={d} right className={d === todayStr() ? 'text-accent' : ''}>{DAY[i]}<div className="text-[11px] font-normal text-muted">{fmtShort(d)}</div></Th>)}<Th right>Total</Th></tr></thead>
          <tbody>
            {[...rows.values()].map((r, i) => (
              <tr key={i}><Td><div className="font-medium">{r.label}</div>{r.sub && <div className="text-xs text-muted">{r.sub}</div>}</Td>{days.map((d) => <Td key={d} right className="num">{hrs(r.per[d] ?? 0)}</Td>)}<Td right className="num font-semibold">{hrs(r.total)}</Td></tr>
            ))}
            {data && !rows.size && <tr><Td colSpan={9} className="py-8 text-center text-muted">No time logged this week.</Td></tr>}
          </tbody>
          {!!rows.size && <tfoot><tr className="border-t border-line"><Td className="font-semibold">Total</Td>{days.map((d) => <Td key={d} right className="num font-semibold">{hrs(dayTotal(d))}</Td>)}<Td right className="num font-semibold">{hrs(data?.total ?? 0)}</Td></tr></tfoot>}
        </Table>
      </Card>

      {!!data?.items.length && (
        <Panel title="Entries">
          <ul className="divide-y divide-line text-sm">
            {data.items.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
                <span className="min-w-0 truncate">{fmtShort(e.day)}, {team ? `${personName(e.user)}, ` : ''}{e.task?.title ?? e.project?.name ?? 'General work'}{e.description ? `: ${e.description}` : ''}{!e.isBillable && <span className="text-muted"> (not billable)</span>}</span>
                <span className="flex shrink-0 items-center gap-2"><span className="num text-muted">{hrs(e.minutes)}</span>
                  {can('TASKS', 'EDIT') && e.userId === me.id && <button type="button" aria-label="Remove entry" className="text-muted hover:text-bad" onClick={() => act(() => api(`/tasks/timesheet/${e.id}`, { method: 'DELETE' }), 'Entry removed').then(reload)}><Trash2 size={15} /></button>}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <FormDialog open={!!add} onClose={() => setAdd(null)} title="Add time" submitLabel="Add time" fields={fields} initial={{ date: add, isBillable: true }}
        onSubmit={async ({ hours, ...v }) => {
          const minutes = Math.round(Number(hours) * 60)
          await api('/tasks/timesheet', { body: { ...v, minutes } })
          toast.success('Time added'); reload()
        }} />
    </div>
  )
}
