'use client'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { FormDialog, type Field } from '@/components/form'
import { Board } from '@/components/misc'
import { Resource } from '@/components/resource'
import { Avatar, Button, Card, Empty, Status, Table, Tabs, Td, Th, Two } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { day, fmtDateTime, fmtShort, human, inrShort, leadLabel, options, personName, plusDays } from '@/lib/format'
import { act, DueTag, Person, useCustomerOptions, userOptions } from './common'

const party = (r: any) => r.customer?.name ?? leadLabel(r.lead) ?? ''

function Pipeline() {
  const { lookups, can } = useAuth()
  const customers = useCustomerOptions()
  const { data, reload } = useApi<{ items: any[] }>('/deals?limit=500')
  const [form, setForm] = useState<{ row?: any } | null>(null)
  const stages: any[] = lookups.pipelines[0]?.stages ?? []
  const deals = data?.items ?? []
  const fields: Field[] = [
    { name: 'title', label: 'Deal', required: true, full: true }, { name: 'customerId', label: 'Customer', type: 'select', options: customers },
    { name: 'value', label: 'Value (₹)', type: 'number' }, { name: 'stageId', label: 'Stage', type: 'select', options: stages.map((s) => ({ value: s.id, label: s.name })), required: true },
    { name: 'expectedCloseDate', label: 'Expected close', type: 'date' }, { name: 'ownerId', label: 'Owner', type: 'select', options: userOptions(lookups), placeholder: 'Me' },
  ]
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">Drag a deal to another stage. An accepted quotation moves its deal to Won.</p>
        {can('SALES', 'CREATE') && <Button variant="primary" onClick={() => setForm({})}><Plus size={16} />Add deal</Button>}
      </div>
      <Board
        items={deals} columnOf={(d: any) => d.stageId} onOpen={can('SALES', 'EDIT') ? (d: any) => setForm({ row: d }) : undefined}
        columns={stages.map((s) => { const ds = deals.filter((d) => d.stageId === s.id); return { key: s.id, label: s.name, meta: `${ds.length}, ${inrShort(ds.reduce((a, d) => a + d.value, 0))}` } })}
        onMove={can('SALES', 'EDIT') ? (d: any, to) => act(() => api(`/deals/${d.id}`, { method: 'PATCH', body: { stageId: to } })).then(reload) : undefined}
        render={(d: any) => <><div className="font-medium">{d.title}</div><div className="text-xs text-muted">{party(d)}</div><div className="mt-2 flex items-center justify-between gap-2 text-xs"><span className="num font-medium">{inrShort(d.value)}</span><span className="flex items-center gap-1.5 text-muted">{d.expectedCloseDate && fmtShort(d.expectedCloseDate)}<Avatar name={personName(d.owner)} /></span></div></>}
      />
      <FormDialog open={!!form} onClose={() => setForm(null)} title={form?.row ? 'Edit deal' : 'Add deal'} fields={fields} submitLabel={form?.row ? 'Save changes' : 'Add deal'}
        initial={form?.row ? { ...form.row, expectedCloseDate: day(form.row.expectedCloseDate), customerId: form.row.customerId ?? '' } : { stageId: stages[0]?.id, expectedCloseDate: plusDays(30) }}
        onSubmit={async (v) => { if (form?.row) await api(`/deals/${form.row.id}`, { method: 'PATCH', body: v }); else await api('/deals', { body: v }); toast.success('Deal saved'); reload() }} />
    </div>
  )
}

function FollowUps() {
  const { lookups, can } = useAuth()
  const customers = useCustomerOptions()
  const [status, setStatus] = useState('PENDING')
  const { data, reload } = useApi<{ items: any[] }>(`/follow-ups?status=${status}`)
  const [done, setDone] = useState<any>(null)
  const [add, setAdd] = useState(false)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={status} onChange={setStatus} options={[{ value: 'PENDING', label: 'To do' }, { value: 'DONE', label: 'Done' }]} />
        {can('SALES', 'CREATE') && <Button variant="primary" onClick={() => setAdd(true)}><Plus size={16} />Add follow-up</Button>}
      </div>
      <Card className="overflow-hidden">
        {!data?.items.length ? <Empty>{status === 'PENDING' ? 'No follow-ups to do. Set the next follow-up date on a lead to see it here.' : 'No completed follow-ups yet.'}</Empty> : (
          <Table>
            <thead><tr><Th>With</Th><Th>Type</Th><Th>Due</Th><Th>Assigned to</Th><Th>Outcome</Th><Th /></tr></thead>
            <tbody>
              {data.items.map((f) => (
                <tr key={f.id}>
                  <Td><Two top={f.lead ? personName(f.lead) : f.customer?.name ?? f.deal?.title} bottom={f.lead?.companyName ?? f.subject} /></Td>
                  <Td>{human(f.type)}</Td><Td><DueTag date={f.dueAt} done={f.status !== 'PENDING'} /></Td><Td><Person user={f.assignedTo} /></Td><Td className="max-w-64 text-muted">{f.outcome}</Td>
                  <Td>{f.status === 'PENDING' && <div className="flex justify-end"><Button size="sm" onClick={() => setDone(f)}>Mark done</Button></div>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <FormDialog open={!!done} onClose={() => setDone(null)} title="Mark follow-up as done" size="sm" submitLabel="Mark done" fields={[{ name: 'outcome', label: 'What happened', type: 'textarea' }]} onSubmit={async (v) => { await api(`/follow-ups/${done.id}/complete`, { body: v }); toast.success('Follow-up done'); reload() }} />
      <FormDialog open={add} onClose={() => setAdd(false)} title="Add follow-up" submitLabel="Add follow-up" initial={{ type: 'CALL', dueAt: plusDays(1) }}
        fields={[{ name: 'customerId', label: 'Customer', type: 'select', options: customers, required: true, full: true }, { name: 'type', label: 'Type', type: 'select', options: options(lookups.enums.FollowUpType), required: true }, { name: 'dueAt', label: 'Due', type: 'date', required: true }, { name: 'subject', label: 'About', full: true }, { name: 'assignedToId', label: 'Assigned to', type: 'select', options: userOptions(lookups), placeholder: 'Me' }]}
        onSubmit={async (v) => { await api('/follow-ups', { body: v }); toast.success('Follow-up added'); reload() }} />
    </div>
  )
}

export default function Sales() {
  const { lookups } = useAuth()
  const customers = useCustomerOptions()
  const [tab, setTab] = useState('pipeline')
  return (
    <div className="space-y-3">
      <Tabs value={tab} onChange={setTab} options={[{ value: 'pipeline', label: 'Deal pipeline' }, { value: 'followups', label: 'Follow-ups' }, { value: 'meetings', label: 'Meetings' }, { value: 'calls', label: 'Calls' }]} />
      {tab === 'pipeline' && <Pipeline />}
      {tab === 'followups' && <FollowUps />}
      {tab === 'meetings' && (
        <Resource path="/meetings" module="SALES" noun="meeting" search="Search meetings"
          fields={[{ name: 'title', label: 'Title', required: true, full: true }, { name: 'customerId', label: 'Customer', type: 'select', options: customers }, { name: 'location', label: 'Place' }, { name: 'startsAt', label: 'Starts', type: 'datetime-local', required: true }, { name: 'endsAt', label: 'Ends', type: 'datetime-local', required: true }, { name: 'meetingUrl', label: 'Meeting link', full: true }, { name: 'agenda', label: 'Agenda', type: 'textarea' }, { name: 'outcome', label: 'Outcome', type: 'textarea' }]}
          columns={[{ header: 'Meeting', cell: (r) => <Two top={r.title} bottom={party(r)} /> }, { header: 'When', cell: (r) => fmtDateTime(r.startsAt) }, { header: 'Place', cell: (r) => r.location ?? (r.meetingUrl ? 'Online' : '') }, { header: 'Organiser', cell: (r) => <Person user={r.organizer} /> }, { header: 'Outcome', cell: (r) => <span className="text-muted">{r.outcome}</span>, className: 'max-w-64' }]} />
      )}
      {tab === 'calls' && (
        <Resource path="/calls" module="SALES" noun="call" search="Search calls" canEdit={false} defaults={{ direction: 'OUTBOUND' }}
          fields={[{ name: 'direction', label: 'Direction', type: 'select', options: options(lookups.enums.Direction), required: true }, { name: 'phone', label: 'Phone number', required: true }, { name: 'customerId', label: 'Customer', type: 'select', options: customers }, { name: 'durationSeconds', label: 'Length (seconds)', type: 'number' }, { name: 'outcome', label: 'Outcome', full: true }, { name: 'notes', label: 'Notes', type: 'textarea' }]}
          columns={[{ header: 'When', cell: (r) => fmtDateTime(r.calledAt) }, { header: 'With', cell: (r) => <Two top={party(r) || r.phone} bottom={party(r) ? r.phone : ''} /> }, { header: 'Direction', cell: (r) => <Status value={r.direction} /> }, { header: 'Outcome', cell: (r) => r.outcome }, { header: 'By', cell: (r) => <Person user={r.user} /> }]} />
      )}
    </div>
  )
}
