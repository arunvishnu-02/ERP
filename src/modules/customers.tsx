'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { FormDialog, type Field } from '@/components/form'
import { RecordPanel } from '@/components/record'
import { Resource } from '@/components/resource'
import { Button, Card, KV, Panel, Sheet, Status, Two } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useUrlParam } from '@/lib/url'
import { fmtDate, human, inr, options, personName } from '@/lib/format'
import { act, ExpiryTag, Person, stateOptions, userOptions } from './common'

const contactFields: Field[] = [
  { name: 'firstName', label: 'First name', required: true }, { name: 'lastName', label: 'Last name' }, { name: 'designation', label: 'Designation' },
  { name: 'email', label: 'Email', type: 'email' }, { name: 'phone', label: 'Phone, with country code' }, { name: 'whatsappNumber', label: 'WhatsApp number, if different' },
  { name: 'isPrimary', label: 'Primary contact', type: 'checkbox', placeholder: 'Quotations and invoices go to this person' },
]

function Mini({ title, rows, empty }: { title: string; rows: { key: string; left: React.ReactNode; right: React.ReactNode }[]; empty: string }) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-medium text-muted">{title}</h4>
      {rows.length ? <ul className="divide-y divide-line text-sm">{rows.map((r) => <li key={r.key} className="flex items-center justify-between gap-3 py-1.5"><span className="min-w-0 truncate">{r.left}</span><span className="shrink-0">{r.right}</span></li>)}</ul> : <p className="text-sm text-muted">{empty}</p>}
    </div>
  )
}

function CustomerSheet({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { can } = useAuth()
  const { data: c, reload } = useApi<any>(id ? `/customers/${id}` : null)
  const { data: h } = useApi<any>(id ? `/customers/${id}/history` : null)
  const [contact, setContact] = useState(false)
  const open = !!id && c?.id === id
  return (
    <>
      <Sheet open={open} onClose={onClose} title={c?.name ?? ''} subtitle={c && <span className="num">{c.customerNumber}</span>}>
        {c && <>
          <Card className="p-4">
            <KV rows={[
              ['Type', human(c.type)], ['GSTIN', c.gstin && <span className="num">{c.gstin}</span>], ['PAN', c.pan], ['Email', c.email], ['Phone', c.phone], ['Website', c.website],
              ['Billing address', [c.billingAddressLine1, c.billingAddressLine2, c.billingCity, c.billingState, c.billingPincode].filter(Boolean).join(', ')],
              ['Payment terms', `${c.paymentTermsDays} days`], ['Account manager', <Person key="m" user={c.accountManager} />], ['Billed', inr(c.billed)], ['Outstanding', inr(c.outstanding)],
            ]} />
          </Card>
          <Panel title="Contacts" action={can('CUSTOMERS', 'EDIT') && <Button size="sm" onClick={() => setContact(true)}>Add contact</Button>}>
            {c.contacts.length ? (
              <ul className="divide-y divide-line text-sm">
                {c.contacts.map((p: any) => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"><Two top={<>{personName(p)}{p.isPrimary && <span className="ml-2 text-xs font-normal text-accent">Primary</span>}</>} bottom={p.designation} /><span className="flex flex-wrap items-center gap-2 text-[13px] text-muted">{[p.email, p.phone].filter(Boolean).join(' | ')}
                  {can('CUSTOMERS', 'EDIT') && p.email && <Button size="sm" variant={p.portalAccess ? 'primary' : undefined} title={p.portalAccess ? 'Can sign in to the client portal. Click to turn off.' : 'Let this person sign in to the client portal with a code sent to their email'}
                    onClick={() => act(() => api(`/customers/${c.id}/contacts/${p.id}`, { method: 'PATCH', body: { portalAccess: !p.portalAccess } }), p.portalAccess ? 'Portal access turned off' : `${p.firstName} can now sign in at ${window.location.origin}/portal`).then(reload)}>
                    {p.portalAccess ? 'Portal on' : 'Give portal access'}</Button>}
                </span></li>)}
              </ul>
            ) : <p className="text-sm text-muted">No contacts yet. Add the person who receives quotations and invoices.</p>}
          </Panel>
          {h && (
            <Card className="grid gap-5 p-4 sm:grid-cols-2">
              <Mini title="Projects" empty="No projects" rows={h.projects.map((p: any) => ({ key: p.id, left: p.name, right: <Status value={p.status} /> }))} />
              <Mini title="Quotations" empty="No quotations" rows={h.quotations.map((q: any) => ({ key: q.id, left: <span className="num">{q.quotationNumber}</span>, right: <Status value={q.status} /> }))} />
              <Mini title="Invoices" empty="No invoices" rows={h.invoices.map((i: any) => ({ key: i.id, left: <><span className="num">{i.invoiceNumber.startsWith('DRAFT-') ? 'Draft' : i.invoiceNumber}</span> <span className="num text-muted">{inr(i.totalAmount)}</span></>, right: <Status value={i.status} /> }))} />
              <Mini title="Payments" empty="No payments" rows={h.payments.map((p: any) => ({ key: p.id, left: <span className="num">{p.receiptNumber}</span>, right: <span className="num">{inr(p.amount)} <span className="text-muted">{fmtDate(p.paymentDate)}</span></span> }))} />
              <Mini title="Domains, hosting and SSL" empty="Nothing to renew" rows={h.webAssets.map((w: any) => ({ key: w.id, left: w.name, right: <ExpiryTag date={w.expiryDate} /> }))} />
              <Mini title="Tickets" empty="No tickets" rows={h.tickets.map((t: any) => ({ key: t.id, left: t.subject, right: <Status value={t.status} /> }))} />
            </Card>
          )}
          <RecordPanel entityType="CUSTOMER" entityId={c.id} />
        </>}
      </Sheet>
      {c && <FormDialog open={contact} onClose={() => setContact(false)} title="Add contact" fields={contactFields} submitLabel="Add contact" onSubmit={async (v) => { await api(`/customers/${c.id}/contacts`, { body: v }); toast.success('Contact added'); reload(); onChanged() }} />}
    </>
  )
}

export default function Customers() {
  const { lookups } = useAuth()
  const [openId, setOpenId] = useState<string | null>(null)
  useUrlParam('open', setOpenId)
  const [rk, setRk] = useState(0)
  const fields: Field[] = [
    { name: 'name', label: 'Customer name', required: true, full: true },
    { name: 'type', label: 'Type', type: 'select', options: options(lookups.enums.CustomerType), required: true }, { name: 'industry', label: 'Industry' },
    { name: 'gstin', label: 'GSTIN' }, { name: 'pan', label: 'PAN' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'phone', label: 'Phone, with country code' }, { name: 'website', label: 'Website' },
    { name: 'billingStateCode', label: 'State', type: 'select', options: stateOptions(lookups), help: 'Decides CGST and SGST or IGST. Choose Outside India for export.' },
    { name: 'billingAddressLine1', label: 'Billing address', full: true }, { name: 'billingCity', label: 'City' }, { name: 'billingPincode', label: 'PIN code' },
    { name: 'paymentTermsDays', label: 'Payment terms (days)', type: 'number' }, { name: 'accountManagerId', label: 'Account manager', type: 'select', options: userOptions(lookups) },
  ]
  return (
    <>
      <Resource
        path="/customers" module="CUSTOMERS" noun="customer" search="Search name, GSTIN, phone or email" exportName="customers" fields={fields} reloadKey={rk} onOpen={(r) => setOpenId(r.id)}
        defaults={{ type: 'COMPANY', paymentTermsDays: lookups.organization.settings?.paymentTermsDays ?? 15, billingStateCode: lookups.organization.stateCode ?? '' }}
        empty="No customers yet. A customer is created when you convert a lead, or you can add one here."
        columns={[
          { header: 'Customer', cell: (r) => <Two top={r.name} bottom={<span className="num">{r.customerNumber}</span>} />, text: (r) => r.name },
          { header: 'Contact', cell: (r) => { const p = r.contacts?.[0]; return p ? <Two top={<span className="font-normal">{personName(p)}</span>} bottom={p.email ?? p.phone} /> : <span className="text-muted">{r.email ?? r.phone ?? 'None'}</span> }, text: (r) => personName(r.contacts?.[0]) || r.email },
          { header: 'State', cell: (r) => r.billingState, text: (r) => r.billingState },
          { header: 'GSTIN', cell: (r) => (r.gstin ? <span className="num">{r.gstin}</span> : <span className="text-muted">{r.isExport ? 'Export' : 'Not given'}</span>), text: (r) => r.gstin },
          { header: 'Account manager', cell: (r) => <Person user={r.accountManager} />, text: (r) => personName(r.accountManager) },
          { header: 'Billed', right: true, cell: (r) => inr(r.billed), text: (r) => r.billed },
          { header: 'Outstanding', right: true, cell: (r) => inr(r.outstanding), text: (r) => r.outstanding },
        ]}
      />
      <CustomerSheet id={openId} onClose={() => setOpenId(null)} onChanged={() => setRk((k) => k + 1)} />
    </>
  )
}
