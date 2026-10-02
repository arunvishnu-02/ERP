'use client'
import { MessageCircle, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { DocEditor } from '@/components/doc'
import { ConfirmDialog, FormDialog, type Field } from '@/components/form'
import { Board, Workflow } from '@/components/misc'
import { RecordPanel } from '@/components/record'
import { exportXlsx, Resource } from '@/components/resource'
import { Badge, Button, Card, Dialog, Field as FieldWrap, Input, KV, Select, Sheet, Status, Tabs, Textarea, Two } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { day, human, inr, inrShort, leadLabel, personName, plusDays, waLink } from '@/lib/format'
import { act, DueTag, Person, userOptions } from './common'

const stageTone = (s: any) => (s?.isWon ? 'good' : s?.isLost ? 'bad' : s?.isDefault ? 'info' : 'accent')
const StageBadge = ({ stage }: { stage: any }) => <Badge tone={stageTone(stage)}>{stage?.name}</Badge>

function useLeadFields(): Field[] {
  const { lookups } = useAuth()
  return [
    { name: 'firstName', label: 'First name', required: true }, { name: 'lastName', label: 'Last name' },
    { name: 'companyName', label: 'Company' }, { name: 'phone', label: 'Phone, with country code', placeholder: '919812345678' },
    { name: 'email', label: 'Email', type: 'email' }, { name: 'whatsappNumber', label: 'WhatsApp number, if different' },
    { name: 'state', label: 'State', type: 'select', options: lookups.states.map((s: any) => ({ value: s.name, label: s.name })), help: 'Decides CGST and SGST or IGST on quotations' }, { name: 'city', label: 'City' },
    { name: 'sourceId', label: 'Source', type: 'select', options: lookups.leadSources.filter((s: any) => s.isActive).map((s: any) => ({ value: s.id, label: s.name })) },
    { name: 'estimatedValue', label: 'Estimated value (₹)', type: 'number' },
    { name: 'requirement', label: 'What they need', type: 'textarea' },
    { name: 'ownerId', label: 'Owner', type: 'select', options: userOptions(lookups), placeholder: 'Assign automatically, or to me' },
    { name: 'nextFollowUpAt', label: 'Next follow-up', type: 'date' },
  ]
}

export function LeadSheet({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { lookups, can, me } = useAuth()
  const { data: lead, reload } = useApi<any>(id ? `/leads/${id}` : null)
  const fields = useLeadFields()
  const [log, setLog] = useState({ type: 'CALL', note: '', nextFollowUpAt: plusDays(2) })
  const [edit, setEdit] = useState(false)
  const [quote, setQuote] = useState(false)
  const [convert, setConvert] = useState(false)
  const [tick, setTick] = useState(0)
  const changed = () => { reload(); setTick((t) => t + 1); onChanged() }
  const open = !!id && !!lead && lead.id === id
  const editable = can('LEADS', 'EDIT') && lead?.status !== 'CONVERTED'
  const qs: any[] = lead?.quotations ?? []
  const step = !lead ? 0 : lead.status === 'CONVERTED' ? 4 : qs.some((q) => ['APPROVED', 'SENT', 'VIEWED', 'ACCEPTED'].includes(q.status)) ? 4 : qs.some((q) => q.status === 'PENDING_APPROVAL') ? 3 : qs.length ? 2 : lead.lastContactedAt ? 1 : 0
  const phone = lead?.whatsappNumber || lead?.phone

  async function saveLog(e: React.FormEvent) {
    e.preventDefault()
    if (await act(() => api(`/leads/${lead.id}/log`, { body: log }), 'Saved to the timeline')) { setLog((l) => ({ ...l, note: '' })); changed() }
  }
  return (
    <>
      <Sheet open={open} onClose={onClose} title={lead ? personName(lead) : ''} subtitle={lead && <>{lead.companyName ? `${lead.companyName}, ` : ''}<span className="num">{lead.leadNumber}</span></>}
        actions={lead && <>
          {phone && <Button onClick={() => { window.open(waLink(phone, `Hi ${lead.firstName}, this is ${me.name.split(' ')[0]} from ${lookups.organization.name}.`), '_blank', 'noopener'); if (editable) act(() => api(`/leads/${lead.id}/log`, { body: { type: 'WHATSAPP_SENT', note: 'Opened a WhatsApp chat', nextFollowUpAt: day(lead.nextFollowUpAt) } })).then(changed) }}><MessageCircle size={15} />WhatsApp</Button>}
          {editable && <Button onClick={() => setEdit(true)}>Edit</Button>}
          {editable && lead.status === 'OPEN' && <Button onClick={() => setConvert(true)}>Convert to customer</Button>}
          {can('QUOTATIONS', 'CREATE') && lead.status === 'OPEN' && <Button variant="primary" onClick={() => setQuote(true)}>Create quotation</Button>}
        </>}>
        {lead && <>
          <Workflow step={step} />
          <Card className="p-4">
            <KV rows={[
              ['Stage', editable ? <Select className="h-8 w-auto text-[13px]" value={lead.stageId} onChange={(e) => act(() => api(`/leads/${lead.id}`, { method: 'PATCH', body: { stageId: e.target.value } })).then(changed)} aria-label="Stage">{lookups.leadStages.filter((s: any) => !s.isWon).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select> : <StageBadge stage={lead.stage} />],
              ['Owner', <Person key="o" user={lead.owner} />], ['Phone', lead.phone], ['Email', lead.email], ['Location', [lead.city, lead.state].filter(Boolean).join(', ')], ['Source', lead.source?.name],
              ['Needs', lead.requirement], ['Estimated value', lead.estimatedValue ? inr(lead.estimatedValue) : ''], ['Next follow-up', lead.status === 'OPEN' ? <DueTag key="d" date={lead.nextFollowUpAt} /> : ''],
              ['Customer', lead.customer?.name],
              ['Quotations', qs.length ? <span key="q" className="flex flex-wrap gap-x-4 gap-y-1">{qs.map((q) => <span key={q.id} className="flex items-center gap-2"><span className="num">{q.quotationNumber}</span><Status value={q.status} /></span>)}</span> : ''],
            ]} />
          </Card>
          {editable && (
            <Card className="p-4">
              <form onSubmit={saveLog} className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
                <FieldWrap label="What happened"><Select value={log.type} onChange={(e) => setLog({ ...log, type: e.target.value })}>{['CALL', 'MEETING', 'WHATSAPP_SENT', 'EMAIL_SENT', 'NOTE_ADDED'].map((t) => <option key={t} value={t}>{human(t)}</option>)}</Select></FieldWrap>
                <FieldWrap label="Summary"><Textarea rows={2} value={log.note} onChange={(e) => setLog({ ...log, note: e.target.value })} placeholder="What was said or agreed" required /></FieldWrap>
                <FieldWrap label="Next follow-up"><Input type="date" value={log.nextFollowUpAt} onChange={(e) => setLog({ ...log, nextFollowUpAt: e.target.value })} /></FieldWrap>
                <div className="flex items-end"><Button type="submit" variant="primary">Save to timeline</Button></div>
              </form>
            </Card>
          )}
          <RecordPanel entityType="LEAD" entityId={lead.id} reloadKey={tick} />
        </>}
      </Sheet>
      {lead && <FormDialog open={edit} onClose={() => setEdit(false)} title="Edit lead" fields={fields.filter((f) => f.name !== 'nextFollowUpAt')} initial={{ ...lead, estimatedValue: lead.estimatedValue ?? '' }} submitLabel="Save changes" onSubmit={async (v) => { await api(`/leads/${lead.id}`, { method: 'PATCH', body: v }); toast.success('Changes saved'); changed() }} />}
      {lead && <DocEditor kind="quotation" open={quote} onClose={() => setQuote(false)} preset={{ party: `l:${lead.id}`, items: [{ description: '', quantity: 1, unitPrice: lead.estimatedValue ?? '' }] }} onSaved={changed} />}
      {lead && <ConfirmDialog open={convert} onClose={() => setConvert(false)} title="Convert this lead to a customer?" confirmLabel="Convert to customer" onConfirm={async () => { await api(`/leads/${lead.id}/convert`, { method: 'POST' }); toast.success('Customer created'); changed() }}>A customer record is created with {personName(lead)} as the primary contact. The lead is marked as won.</ConfirmDialog>}
    </>
  )
}

const IMPORT_COLUMNS = ['Name', 'Company', 'Email', 'Phone', 'City', 'State', 'Source', 'Requirement', 'Value']
function ImportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  async function run() {
    const file = input.current?.files?.[0]
    if (!file) return toast.error('Choose an Excel file first')
    setBusy(true)
    try {
      const { readSheet } = await import('read-excel-file/browser')
      const [head, ...body] = (await readSheet(file)) as any[][]
      const keys = head.map((h) => String(h ?? '').trim().toLowerCase())
      const rows = body.filter((r) => r.some((c) => c !== null && c !== '')).map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i]])))
      setResult(await api('/leads/import', { body: { rows } }))
      onDone()
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onClose={() => { setResult(null); onClose() }} title="Import leads from Excel" footer={<><Button onClick={() => { setResult(null); onClose() }}>Close</Button>{!result && <Button variant="primary" loading={busy} onClick={run}>Import leads</Button>}</>}>
      {result ? (
        <div className="space-y-2 text-sm">
          <p><b className="font-semibold">{result.created}</b> leads imported{result.failed ? <>, <b className="font-semibold text-bad">{result.failed}</b> rows skipped</> : ''}.</p>
          {result.errors.map((e: any) => <p key={e.row} className="text-muted">Row {e.row}: {e.message}</p>)}
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-muted">Use an .xlsx file with these column headings in the first row: {IMPORT_COLUMNS.join(', ')}. Only Name is required. Source must match one of your lead sources.</p>
          <Button size="sm" onClick={() => exportXlsx('lead-import-template', IMPORT_COLUMNS.map((h) => ({ header: h, cell: () => null, text: () => '' })), [])}>Download a blank template</Button>
          <input ref={input} type="file" accept=".xlsx" className="block text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm" />
        </div>
      )}
    </Dialog>
  )
}

export default function Leads() {
  const { lookups, can } = useAuth()
  const fields = useLeadFields()
  const [view, setView] = useState('list')
  const [openId, setOpenId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [rk, setRk] = useState(0)
  const board = useApi<{ items: any[] }>(view === 'board' ? '/leads?limit=500' : null)
  const refresh = () => { setRk((k) => k + 1); board.reload() }
  const stages: any[] = lookups.leadStages
  return (
    <div className="space-y-3">
      <Tabs value={view} onChange={setView} options={[{ value: 'list', label: 'List' }, { value: 'board', label: 'Pipeline board' }]} />
      {view === 'list' ? (
        <Resource
          path="/leads" module="LEADS" noun="lead" search="Search name, company or phone" exportName="leads" reloadKey={rk} fields={fields} defaults={{ nextFollowUpAt: plusDays(1) }} canEdit={false} onOpen={(r) => setOpenId(r.id)}
          filter={{ param: 'stageId', options: [{ value: '', label: 'All stages' }, ...stages.map((s) => ({ value: s.id, label: s.name }))] }}
          toolbar={() => can('LEADS', 'IMPORT') && <Button onClick={() => setImporting(true)}><Upload size={15} />Import</Button>}
          empty="No leads yet. Add one by hand, import an Excel file, or connect your website form under Settings."
          columns={[
            { header: 'Lead', cell: (r) => <Two top={personName(r)} bottom={r.companyName} />, text: (r) => personName(r) },
            { header: 'Company', exportOnly: true, cell: () => null, text: (r) => r.companyName },
            { header: 'Phone', exportOnly: true, cell: () => null, text: (r) => r.phone },
            { header: 'Email', exportOnly: true, cell: () => null, text: (r) => r.email },
            { header: 'Needs', cell: (r) => <Two top={<span className="font-normal">{r.requirement || <span className="text-muted">Not noted</span>}</span>} bottom={r.source?.name} />, text: (r) => r.requirement, className: 'max-w-64' },
            { header: 'Est. value', right: true, cell: (r) => (r.estimatedValue ? inr(r.estimatedValue) : ''), text: (r) => r.estimatedValue },
            { header: 'Owner', cell: (r) => <Person user={r.owner} />, text: (r) => personName(r.owner) },
            { header: 'Next follow-up', cell: (r) => (r.status === 'OPEN' ? <DueTag date={r.nextFollowUpAt} /> : <span className="text-muted">None</span>), text: (r) => day(r.nextFollowUpAt) },
            { header: 'Stage', cell: (r) => <StageBadge stage={r.stage} />, text: (r) => r.stage?.name },
          ]}
        />
      ) : (
        <Board
          items={board.data?.items ?? []} columnOf={(l: any) => l.stageId} onOpen={(l: any) => setOpenId(l.id)}
          columns={stages.map((s) => { const ls = (board.data?.items ?? []).filter((l) => l.stageId === s.id); return { key: s.id, label: s.name, meta: `${ls.length}, ${inrShort(ls.reduce((a, l) => a + (l.estimatedValue ?? 0), 0))}` } })}
          onMove={can('LEADS', 'EDIT') ? (l: any, to) => { if (stages.find((s) => s.id === to)?.isWon) return void toast.error('To mark a lead as won, open it and convert it to a customer'); act(() => api(`/leads/${l.id}`, { method: 'PATCH', body: { stageId: to } })).then(refresh) } : undefined}
          render={(l: any) => <><div className="font-medium">{leadLabel(l)}</div><div className="text-xs text-muted">{l.companyName ? personName(l) : l.requirement}</div><div className="mt-2 flex items-center justify-between gap-2 text-xs"><span className="num font-medium">{l.estimatedValue ? inrShort(l.estimatedValue) : ''}</span>{l.status === 'OPEN' && <DueTag date={l.nextFollowUpAt} />}</div></>}
        />
      )}
      <LeadSheet id={openId} onClose={() => setOpenId(null)} onChanged={refresh} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} onDone={refresh} />
    </div>
  )
}
