'use client'
import { Copy, Mail, MessageCircle, Plus, Printer, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { DocEditor, DocView } from '@/components/doc'
import { FormDialog } from '@/components/form'
import { Workflow } from '@/components/misc'
import { Resource } from '@/components/resource'
import { Button, Card, Dialog, Empty, Field, Input, Panel, Select, Sheet, Status, Table, Tabs, Td, Th, Two } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { ago, fmtDate, human, inr, leadLabel, options, personName, waLink } from '@/lib/format'
import { act, Person, userOptions } from './common'

const partyName = (q: any) => q.customer?.name ?? leadLabel(q.lead)
const STEP: Record<string, number> = { DRAFT: 2, REJECTED: 2, PENDING_APPROVAL: 3, APPROVED: 4, SENT: 4, VIEWED: 4, ACCEPTED: 4, DECLINED: 4, EXPIRED: 4, CONVERTED: 5 }

/** Send a quotation or invoice: by email from the system, through WhatsApp on your own number, or as a link. */
export function SendDialog({ kind, doc, open, onClose, onSent }: { kind: 'quotation' | 'invoice'; doc: any; open: boolean; onClose: () => void; onSent: () => void }) {
  const contact = doc?.customer?.contacts?.[0]
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState('')
  useEffect(() => { if (open) setTo(contact?.email ?? doc?.customer?.email ?? doc?.lead?.email ?? '') }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  async function send(channel: 'EMAIL' | 'WHATSAPP' | 'LINK') {
    setBusy(channel)
    try {
      const r = await api(`/${kind}s/${doc.id}/send`, { body: { channel, to: channel === 'EMAIL' ? to : '' } })
      if (channel === 'EMAIL') r.email?.sent ? toast.success(`Emailed to ${to}`) : toast.error(r.email?.error ?? 'The email could not be sent')
      if (channel === 'WHATSAPP') window.open(waLink(r.phone, r.message), '_blank', 'noopener')
      if (channel === 'LINK') { await navigator.clipboard?.writeText(r.link).catch(() => {}); toast.success('Link copied. Paste it into any message.') }
      onSent()
      onClose()
    } catch (e) { toast.error((e as Error).message) } finally { setBusy('') }
  }
  const draft = kind === 'invoice' && doc?.status === 'DRAFT'
  return (
    <Dialog open={open} onClose={onClose} title={`Send ${kind}`} size="sm">
      <div className="space-y-4 text-sm">
        <p className="text-muted">{draft ? 'Sending gives the invoice its number. After that it cannot be edited; use a credit note for corrections.' : 'The customer gets a link to view it online, where they can also print it or save it as a PDF.'}</p>
        <Field label="Email address"><Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="customer@example.com" /></Field>
        <div className="grid gap-2">
          <Button variant="primary" loading={busy === 'EMAIL'} disabled={!to} onClick={() => send('EMAIL')}><Mail size={15} />Send by email</Button>
          <Button loading={busy === 'WHATSAPP'} onClick={() => send('WHATSAPP')}><MessageCircle size={15} />Open in WhatsApp</Button>
          <Button loading={busy === 'LINK'} onClick={() => send('LINK')}><Copy size={15} />Copy the link</Button>
        </div>
      </div>
    </Dialog>
  )
}

export function QuotationSheet({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { can, lookups, me } = useAuth()
  const [cur, setCur] = useState(id)
  useEffect(() => setCur(id), [id])
  const { data: q, reload } = useApi<any>(cur ? `/quotations/${cur}` : null)
  const [dlg, setDlg] = useState<null | 'edit' | 'reject' | 'send' | 'convert'>(null)
  const open = !!cur && q?.id === cur
  const changed = () => { reload(); onChanged() }
  const go = (path: string, done: string) => act(() => api(`/quotations/${q.id}/${path}`, { method: 'POST' }), done).then((ok) => ok && changed())
  const edit = can('QUOTATIONS', 'EDIT')
  const s = q?.status
  return (
    <>
      <Sheet open={open} onClose={onClose} title={q ? `Quotation ${q.quotationNumber}` : ''} subtitle={q && <>{partyName(q)}, revision {q.revision}, prepared by {personName(q.preparedBy)}</>}
        actions={q && <>
          <Button onClick={() => window.open(`/print/quotation/${q.id}`, '_blank')}><Printer size={15} />Print or PDF</Button>
          {edit && s === 'DRAFT' && <Button onClick={() => setDlg('edit')}>Edit</Button>}
          {edit && ['REJECTED', 'APPROVED', 'SENT', 'VIEWED', 'DECLINED'].includes(s) && q.isLatest && <Button onClick={() => act(async () => { const r = await api(`/quotations/${q.id}/revise`, { method: 'POST' }); setCur(r.id); onChanged() }, 'New revision created as a draft')}>Revise</Button>}
          {edit && ['SENT', 'VIEWED'].includes(s) && <><Button onClick={() => go('decline', 'Marked as declined')}>Customer declined</Button><Button onClick={() => go('accept', 'Marked as accepted')}>Customer accepted</Button></>}
          {can('QUOTATIONS', 'APPROVE') && s === 'PENDING_APPROVAL' && <><Button variant="danger" onClick={() => setDlg('reject')}>Reject</Button><Button variant="primary" onClick={() => go('approve', 'Quotation approved')}>Approve</Button></>}
          {edit && s === 'DRAFT' && <Button variant="primary" onClick={() => go('submit', 'Sent for approval')}>Submit for approval</Button>}
          {edit && ['APPROVED', 'SENT', 'VIEWED'].includes(s) && <Button variant={s === 'APPROVED' ? 'primary' : 'secondary'} onClick={() => setDlg('send')}>{s === 'APPROVED' ? 'Send to customer' : 'Send again'}</Button>}
          {edit && s === 'ACCEPTED' && <Button variant="primary" onClick={() => setDlg('convert')}>Create project</Button>}
        </>}>
        {q && <>
          <Workflow step={STEP[s] ?? 2} />
          {!q.isLatest && <Card className="border-warn/40 bg-warn-soft px-4 py-2.5 text-sm text-warn">This is an older revision. Revision {q.revisions[0].revision} replaced it.</Card>}
          {s === 'REJECTED' && q.rejectionNote && <Card className="border-bad/40 bg-bad-soft px-4 py-2.5 text-sm text-bad"><b className="font-semibold">Rejected:</b> {q.rejectionNote}</Card>}
          {s === 'PENDING_APPROVAL' && !can('QUOTATIONS', 'APPROVE') && <Card className="px-4 py-2.5 text-sm text-muted">Waiting for a manager to approve. You will get a notification when it is decided.</Card>}
          {s === 'CONVERTED' && q.projects[0] && <Card className="border-good/40 bg-good-soft px-4 py-2.5 text-sm text-good">Project created: {q.projects[0].name} ({q.projects[0].projectNumber})</Card>}
          <DocView kind="quotation" doc={q} org={lookups.organization} />
          <Panel title="History">
            <ul className="space-y-2 text-sm">{q.activities.map((a: any) => <li key={a.id} className="flex items-baseline justify-between gap-3"><span className="min-w-0 break-words">{a.summary}</span><span className="shrink-0 text-xs text-muted">{a.actor ? personName(a.actor) : 'Customer'}, {ago(a.occurredAt)}</span></li>)}</ul>
          </Panel>
        </>}
      </Sheet>
      {q && <>
        <DocEditor kind="quotation" open={dlg === 'edit'} onClose={() => setDlg(null)} initial={q} onSaved={changed} />
        <SendDialog kind="quotation" doc={q} open={dlg === 'send'} onClose={() => setDlg(null)} onSent={changed} />
        <FormDialog open={dlg === 'reject'} onClose={() => setDlg(null)} title="Reject this quotation" size="sm" submitLabel="Reject quotation" fields={[{ name: 'note', label: 'Reason, shown to the person who prepared it', type: 'textarea', required: true }]} onSubmit={async (v) => { await api(`/quotations/${q.id}/reject`, { body: v }); toast.success('Rejected and sent back'); changed() }} />
        <FormDialog open={dlg === 'convert'} onClose={() => setDlg(null)} title="Create project" submitLabel="Create project"
          intro={<p className="text-sm text-muted">Each line of the quotation becomes a billable milestone.{q.customer ? '' : ' The lead becomes a customer.'}</p>}
          initial={{ name: q.title || `${q.items[0]?.description} for ${partyName(q)}`, managerId: me.id, category: 'OTHER', memberIds: [] }}
          fields={[{ name: 'name', label: 'Project name', required: true, full: true }, { name: 'managerId', label: 'Project manager', type: 'select', options: userOptions(lookups), required: true }, { name: 'category', label: 'Type of work', type: 'select', options: options(lookups.enums.ServiceCategory), required: true }, { name: 'dueDate', label: 'Due date', type: 'date' }, { name: 'memberIds', label: 'Team members', type: 'multi', options: userOptions(lookups) }]}
          onSubmit={async (v) => { const p = await api(`/quotations/${q.id}/convert`, { body: v }); toast.success(`Project ${p.projectNumber} created`); changed() }} />
      </>}
    </>
  )
}

function Packages() {
  const { lookups, can, reloadLookups } = useAuth()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [lines, setLines] = useState<{ serviceId: string; quantity: string }[]>([{ serviceId: '', quantity: '1' }])
  const list = lines.filter((l) => l.serviceId)
  const listPrice = list.reduce((a, l) => a + Number(l.quantity || 0) * (lookups.services.find((s: any) => s.id === l.serviceId)?.basePrice ?? 0), 0)
  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (await act(() => api('/packages', { body: { name, price: Number(price || listPrice), items: list.map((l) => ({ serviceId: l.serviceId, quantity: Number(l.quantity || 1) })) } }), 'Package added')) { setOpen(false); setName(''); setPrice(''); setLines([{ serviceId: '', quantity: '1' }]); reloadLookups() }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">A package adds several services to a quotation in one step.</p>
        {can('QUOTATIONS', 'CREATE') && <Button variant="primary" disabled={!lookups.services.length} onClick={() => setOpen(true)}><Plus size={16} />Add package</Button>}
      </div>
      <Card className="overflow-hidden">
        {!lookups.packages.length ? <Empty>{lookups.services.length ? 'No packages yet.' : 'Add your services first, then group them into packages.'}</Empty> : (
          <Table>
            <thead><tr><Th>Package</Th><Th>Contents</Th><Th right>Price</Th><Th /></tr></thead>
            <tbody>{lookups.packages.map((p: any) => (
              <tr key={p.id}><Td className="font-medium">{p.name}</Td><Td className="text-muted">{p.items.map((i: any) => `${i.quantity} × ${i.service.name}`).join(', ')}</Td><Td right>{inr(p.price)}</Td>
                <Td>{can('QUOTATIONS', 'DELETE') && <div className="flex justify-end"><Button size="icon" variant="ghost" aria-label="Delete package" onClick={() => act(() => api(`/packages/${p.id}`, { method: 'DELETE' }), 'Package deleted').then(reloadLookups)}><Trash2 size={15} /></Button></div>}</Td></tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add package" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="pkg">Add package</Button></>}>
        <form id="pkg" onSubmit={save} className="space-y-3.5">
          <Field label="Package name"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
          {lines.map((l, i) => (
            <div key={i} className="flex items-end gap-2">
              <Field label={i ? '' : 'Service'} className="flex-1"><Select value={l.serviceId} onChange={(e) => setLines(lines.map((x, n) => (n === i ? { ...x, serviceId: e.target.value } : x)))} required={i === 0}><option value="">Select…</option>{lookups.services.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              <Field label={i ? '' : 'Quantity'} className="w-24"><Input type="number" min="0" step="any" value={l.quantity} onChange={(e) => setLines(lines.map((x, n) => (n === i ? { ...x, quantity: e.target.value } : x)))} /></Field>
              <Button size="icon" variant="ghost" aria-label="Remove service" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, n) => n !== i))} className="mb-0.5"><X size={15} /></Button>
            </div>
          ))}
          <Button size="sm" onClick={() => setLines([...lines, { serviceId: '', quantity: '1' }])}><Plus size={14} />Add service</Button>
          <Field label="Package price (₹)" help={`List price of the contents is ${inr(listPrice)}. Leave empty to use it.`}><Input type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
        </form>
      </Dialog>
    </div>
  )
}

export default function Quotations() {
  const { lookups, reloadLookups } = useAuth()
  const [tab, setTab] = useState('quotations')
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [rk, setRk] = useState(0)
  const refresh = () => setRk((k) => k + 1)
  return (
    <div className="space-y-3">
      <Tabs value={tab} onChange={setTab} options={[{ value: 'quotations', label: 'Quotations' }, { value: 'services', label: 'Services' }, { value: 'packages', label: 'Packages' }]} />
      {tab === 'quotations' && (
        <Resource path="/quotations" module="QUOTATIONS" noun="quotation" search="Search number or customer" reloadKey={rk} onOpen={(r) => setOpenId(r.id)} onCreate={() => setCreating(true)}
          filter={{ param: 'status', options: [{ value: '', label: 'All' }, { value: 'DRAFT', label: 'Draft' }, { value: 'PENDING_APPROVAL', label: 'Pending approval' }, { value: 'APPROVED', label: 'Approved' }, { value: 'SENT,VIEWED', label: 'Sent' }, { value: 'ACCEPTED', label: 'Accepted' }, { value: 'CONVERTED', label: 'Converted' }, { value: 'REJECTED,DECLINED', label: 'Rejected or declined' }] }}
          empty="No quotations yet. Create one from a lead, or add one here."
          columns={[
            { header: 'Quotation', cell: (r) => <Two top={<span className="num">{r.quotationNumber}</span>} bottom={`Revision ${r.revision}, ${fmtDate(r.issueDate)}`} /> },
            { header: 'For', cell: (r) => partyName(r) }, { header: 'Amount', right: true, cell: (r) => inr(r.totalAmount) },
            { header: 'Prepared by', cell: (r) => <Person user={r.preparedBy} /> }, { header: 'Valid until', cell: (r) => <span className="text-muted">{fmtDate(r.validUntil)}</span> }, { header: 'Status', cell: (r) => <Status value={r.status} /> },
          ]} />
      )}
      {tab === 'services' && (
        <Resource path="/services" module="QUOTATIONS" noun="service" search="Search services" afterSave={reloadLookups} defaults={{ unit: 'nos', gstRate: 18, billingCycle: 'ONE_TIME', isActive: true, category: 'OTHER' }}
          empty="No services yet. Add what you sell so quotations and invoices can be built quickly."
          fields={[{ name: 'name', label: 'Service', required: true, full: true }, { name: 'category', label: 'Category', type: 'select', options: options(lookups.enums.ServiceCategory), required: true }, { name: 'sacCode', label: 'SAC code', help: 'Ask your accountant for the right code' }, { name: 'unit', label: 'Unit', placeholder: 'nos, hrs, months' }, { name: 'basePrice', label: 'Price (₹)', type: 'number', required: true }, { name: 'gstRate', label: 'GST %', type: 'number' }, { name: 'billingCycle', label: 'Billing', type: 'select', options: options(lookups.enums.BillingCycle) }, { name: 'description', label: 'Description', type: 'textarea' }, { name: 'isActive', label: 'Available', type: 'checkbox', placeholder: 'Show in quotations' }]}
          columns={[{ header: 'Service', cell: (r) => <Two top={r.name} bottom={r.description} /> }, { header: 'Category', cell: (r) => human(r.category) }, { header: 'SAC', cell: (r) => <span className="num">{r.sacCode}</span> }, { header: 'Billing', cell: (r) => human(r.billingCycle) }, { header: 'Price', right: true, cell: (r) => `${inr(r.basePrice)} / ${r.unit}` }, { header: 'GST', right: true, cell: (r) => `${r.gstRate}%` }, { header: '', cell: (r) => (r.isActive ? null : <Status value="PAUSED" label="Hidden" />) }]} />
      )}
      {tab === 'packages' && <Packages />}
      <DocEditor kind="quotation" open={creating} onClose={() => setCreating(false)} onSaved={(q) => { refresh(); setOpenId(q.id) }} />
      <QuotationSheet id={openId} onClose={() => setOpenId(null)} onChanged={refresh} />
    </div>
  )
}
