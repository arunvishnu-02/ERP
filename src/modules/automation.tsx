'use client'
import { Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, cn, Empty, Loading, Panel, Status, Table, Td, Th } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { ago, fmtDateTime } from '@/lib/format'
import { act, userOptions } from './common'

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className={cn('relative h-6 w-10 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50', checked ? 'bg-accent' : 'bg-line')}>
      <span className={cn('absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-4')} />
    </button>
  )
}

export default function Automation() {
  const { lookups, can } = useAuth()
  const { data, reload } = useApi<{ rules: any[]; rotation: any; runs: any[] }>('/automations')
  const [people, setPeople] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (data?.rotation) setPeople(data.rotation.assigneeIds) }, [data?.rotation])
  if (!data) return <Loading />
  const edit = can('AUTOMATION', 'EDIT')
  const users = userOptions(lookups)
  const dirty = JSON.stringify(people) !== JSON.stringify(data.rotation?.assigneeIds ?? [])
  const assignRule = data.rules.find((r) => r.trigger === 'LEAD_CREATED')
  async function runNow() {
    setBusy(true)
    try {
      const r = await api<Record<string, number>>('/automations/run-now', { body: {} })
      const n = Object.values(r).reduce((a, b) => a + (Number(b) || 0), 0)
      toast.success(n ? `Done. ${n} reminders and drafts created.` : 'Done. Nothing was due today.')
      reload()
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-[13px] text-muted">These run on their own. Daily checks run each morning after 9:00. Turn off any you do not want.</p>
        {edit && <Button onClick={runNow} loading={busy}><Play size={15} />Run today's checks now</Button>}
      </div>
      <Card className="divide-y divide-line">
        {data.rules.map((r) => (
          <div key={r.id} className="flex items-start gap-3 px-4 py-3.5">
            <Switch checked={r.isActive} disabled={!edit} label={`${r.name}: ${r.isActive ? 'on' : 'off'}`} onChange={async (v) => { if (await act(() => api(`/automations/${r.id}`, { method: 'PATCH', body: { isActive: v } }), v ? 'Turned on' : 'Turned off')) reload() }} />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{r.name}</div>
              <div className="text-[13px] text-muted">{r.description}</div>
            </div>
            <div className="shrink-0 text-right text-xs text-muted"><div className="num">{r.runCount} times</div>{r.lastRunAt && <div>last {ago(r.lastRunAt)}</div>}</div>
          </div>
        ))}
      </Card>
      <Panel title="Lead rotation">
        <p className="mb-3 text-[13px] text-muted">New leads without an owner go to these people in turn. Tap a name to add or remove it.{assignRule && !assignRule.isActive ? ' The rule "Assign new leads automatically" is off, so nothing is assigned yet.' : ''}</p>
        <div className="flex flex-wrap gap-1.5">
          {users.map((u: any) => {
            const i = people.indexOf(u.value)
            return (
              <button key={u.value} type="button" disabled={!edit} aria-pressed={i >= 0} onClick={() => setPeople(i >= 0 ? people.filter((p) => p !== u.value) : [...people, u.value])} className={cn('rounded-full border px-2.5 py-1 text-[13px]', i >= 0 ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface text-muted hover:text-ink')}>
                {i >= 0 && <span className="num mr-1.5 text-accent">{i + 1}</span>}{u.label}
              </button>
            )
          })}
        </div>
        {edit && dirty && <Button variant="primary" className="mt-3" onClick={async () => { if (await act(() => api('/automations/rotation', { method: 'PUT', body: { assigneeIds: people, isActive: true } }), 'Rotation saved')) reload() }}>Save rotation</Button>}
      </Panel>
      <Panel title="Recent runs" flush>
        {!data.runs.length ? <Empty>Nothing has run yet.</Empty> : (
          <Table>
            <thead><tr><Th>Automation</Th><Th>When</Th><Th right>Items</Th><Th>Result</Th></tr></thead>
            <tbody>{data.runs.map((r) => <tr key={r.id}><Td className="font-medium">{r.rule.name}</Td><Td className="text-muted">{fmtDateTime(r.startedAt)}</Td><Td right>{r.log?.count ?? ''}</Td><Td><Status value={r.status} label={r.status === 'SUCCEEDED' ? 'Done' : undefined} />{r.error ? <span className="ml-2 text-xs text-bad">{r.error}</span> : null}</Td></tr>)}</tbody>
          </Table>
        )}
      </Panel>
      <p className="text-xs text-muted">Email reminders to customers need email set up under Settings. WhatsApp messages open in WhatsApp for you to send; they are not sent automatically.</p>
    </div>
  )
}
