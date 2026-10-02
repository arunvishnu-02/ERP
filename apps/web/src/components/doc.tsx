'use client'
import { Plus, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { amountInWords, computeDoc, day, fmtDate, human, inr, leadLabel, personName, plusDays, todayStr, type Line } from '@/lib/format'
import { Button, cn, Dialog, Field, Input, Select, Status, Table, Td, Textarea, Th } from './ui'

type Kind = 'quotation' | 'invoice'

/** The document as the customer sees it. Used in the app, on the public link and for printing. */
export function DocView({ kind, doc, org }: { kind: Kind; doc: any; org: any }) {
  const inv = kind === 'invoice'
  const c = doc.customer
  const taxed = doc.cgstAmount + doc.sgstAmount + doc.igstAmount > 0
  const draftNo = inv && String(doc.invoiceNumber).startsWith('DRAFT-')
  const row = (label: string, value: number, strong = false) => (
    <div className={cn('flex justify-between gap-6 py-1', strong && 'mt-1 border-t-2 border-ink pt-2 text-base font-semibold')}><span>{label}</span><span className="num">{inr(value, true)}</span></div>
  )
  return (
    <article className="space-y-5 rounded-xl border border-line bg-surface p-5 sm:p-7">
      <header className="flex flex-wrap justify-between gap-5">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-accent">{inv ? 'Tax invoice' : 'Quotation'}</div>
          <h2 className="font-display text-xl font-semibold">{org.legalName || org.name}</h2>
          <div className="text-[13px] text-muted">
            {[org.addressLine1, org.addressLine2, org.city, org.state, org.pincode].filter(Boolean).join(', ')}
            {org.gstin && <div>GSTIN <span className="num text-ink">{org.gstin}</span></div>}
            {(org.phone || org.email) && <div>{[org.phone, org.email].filter(Boolean).join(' | ')}</div>}
          </div>
        </div>
        <dl className="grid grid-cols-[auto_auto] content-start gap-x-4 gap-y-1 text-[13px]">
          <dt className="text-muted">{inv ? 'Invoice no.' : 'Quotation no.'}</dt>
          <dd className="num text-right font-medium">{draftNo ? 'Issued when sent' : inv ? doc.invoiceNumber : `${doc.quotationNumber} (rev ${doc.revision})`}</dd>
          <dt className="text-muted">Date</dt><dd className="text-right">{fmtDate(doc.issueDate)}</dd>
          <dt className="text-muted">{inv ? 'Due date' : 'Valid until'}</dt><dd className="text-right">{fmtDate(inv ? doc.dueDate : doc.validUntil)}</dd>
          <dt className="text-muted">Status</dt><dd className="text-right"><Status value={doc.overdue ? 'OVERDUE' : doc.status} /></dd>
        </dl>
      </header>
      <div className="grid gap-4 text-[13px] sm:grid-cols-2">
        <div>
          <div className="text-xs font-medium text-muted">{inv ? 'Bill to' : 'Prepared for'}</div>
          <div className="font-medium">{c ? c.name : leadLabel(doc.lead)}</div>
          {c ? <div className="text-muted">{[c.billingAddressLine1, c.billingAddressLine2, c.billingCity, c.billingState, c.billingPincode].filter(Boolean).join(', ')}</div> : <div className="text-muted">{[personName(doc.lead), doc.lead?.city, doc.lead?.state].filter(Boolean).join(', ')}</div>}
          {c?.gstin && <div>GSTIN <span className="num">{c.gstin}</span></div>}
        </div>
        <div>
          <div className="text-xs font-medium text-muted">Place of supply</div>
          <div>{c?.billingState ?? doc.lead?.state ?? org.state ?? ''}{!taxed && doc.taxableAmount > 0 ? ' (export of services, zero-rated)' : ''}</div>
        </div>
      </div>
      <Table>
        <thead><tr><Th className="first:pl-0">Description</Th><Th>SAC</Th><Th right>Qty</Th><Th right>Rate</Th><Th right>Disc.</Th><Th right className="last:pr-0">Amount</Th></tr></thead>
        <tbody>
          {doc.items.map((i: any) => (
            <tr key={i.id}>
              <Td className="min-w-48 first:pl-0">{i.description}</Td><Td className="num text-muted">{i.sacCode}</Td>
              <Td right>{i.quantity} {i.unit}</Td><Td right>{inr(i.unitPrice, true)}</Td><Td right>{i.discountPercent ? `${i.discountPercent}%` : ''}</Td><Td right className="last:pr-0">{inr(i.taxableAmount, true)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <div className="ml-auto w-full max-w-xs text-[13.5px]">
        {row('Taxable value', doc.taxableAmount)}
        {doc.igstAmount > 0 ? row('IGST', doc.igstAmount) : taxed ? <>{row('CGST', doc.cgstAmount)}{row('SGST', doc.sgstAmount)}</> : row('GST', 0)}
        {row('Total', doc.totalAmount, true)}
        {inv && doc.status !== 'DRAFT' && <>{row('Received, including TDS', doc.amountPaid + doc.tdsAmount)}{doc.creditedAmount > 0 && row('Credit notes', doc.creditedAmount)}{row('Balance due', doc.balanceDue)}</>}
      </div>
      <p className="text-[13px] text-muted">{amountInWords(doc.totalAmount)}.</p>
      {(doc.terms || doc.notes) && <div className="space-y-1 border-t border-line pt-3 text-[13px]">{doc.notes && <p className="whitespace-pre-wrap">{doc.notes}</p>}{doc.terms && <p className="whitespace-pre-wrap text-muted">{doc.terms}</p>}</div>}
      {inv && org.settings?.bankDetails && <div className="border-t border-line pt-3 text-[13px]"><div className="text-xs font-medium text-muted">Bank details</div><p className="whitespace-pre-wrap">{org.settings.bankDetails}</p></div>}
    </article>
  )
}

const blank = (): Line => ({ description: '', sacCode: '', quantity: 1, unit: 'nos', unitPrice: '', discountPercent: '', taxRate: 18 })
export interface DocPreset { party?: string; projectId?: string; items?: Line[]; notes?: string }

/** Create or edit a quotation or invoice, with a live GST total. */
export function DocEditor({ kind, open, onClose, initial, preset, onSaved }: { kind: Kind; open: boolean; onClose: () => void; initial?: any; preset?: DocPreset; onSaved: (doc: any) => void }) {
  const { lookups, can } = useAuth()
  const inv = kind === 'invoice'
  const customers = useApi<{ items: any[] }>(open && can('CUSTOMERS') ? '/customers?limit=500' : null).data?.items ?? []
  const leads = useApi<{ items: any[] }>(open && !inv && can('LEADS') ? '/leads?status=OPEN&limit=500' : null).data?.items ?? []
  const [party, setParty] = useState('')
  const [issueDate, setIssueDate] = useState(todayStr())
  const [second, setSecond] = useState('')
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState('')
  const [items, setItems] = useState<Line[]>([blank()])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const d = initial
    setParty(d ? (d.customerId ? `c:${d.customerId}` : `l:${d.leadId}`) : preset?.party ?? '')
    setIssueDate(d ? day(d.issueDate) : todayStr())
    setSecond(d ? day(inv ? d.dueDate : d.validUntil) : inv ? '' : plusDays(15))
    setNotes(d?.notes ?? preset?.notes ?? '')
    setTerms(d?.terms ?? '')
    setItems(d ? d.items.map((i: any) => ({ serviceId: i.serviceId, milestoneId: i.milestoneId, description: i.description, sacCode: i.sacCode ?? '', quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice, discountPercent: i.discountPercent || '', taxRate: i.taxRate })) : preset?.items?.length ? preset.items.map((i) => ({ ...blank(), ...i })) : [blank()])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const [ptype, pid] = party.split(':')
  const customer = ptype === 'c' ? customers.find((c) => c.id === pid) ?? (initial?.customer?.id === pid ? initial.customer : null) : null
  const lead = ptype === 'l' ? leads.find((l) => l.id === pid) ?? (initial?.lead?.id === pid ? initial.lead : null) : null
  const code = customer ? customer.billingStateCode : lead ? lookups.states.find((s: any) => s.name === lead.state)?.code : null
  const exportSale = !!customer?.isExport || code === '99'
  const orgCode = lookups.organization.stateCode
  const interState = !exportSale && !!code && !!orgCode && code !== orgCode
  const totals = useMemo(() => computeDoc(items, { interState, exportSale }), [items, interState, exportSale])
  const set = (i: number, patch: Partial<Line>) => setItems((list) => list.map((l, n) => (n === i ? { ...l, ...patch } : l)))
  const pick = (i: number, name: string) => {
    const s = lookups.services.find((x: any) => x.name === name)
    set(i, s ? { description: s.name, serviceId: s.id, sacCode: s.sacCode ?? '', unit: s.unit, unitPrice: s.basePrice, taxRate: s.gstRate } : { description: name, serviceId: null })
  }
  const addPackage = (id: string) => {
    const p = lookups.packages.find((x: any) => x.id === id)
    if (!p) return
    setItems((list) => [...list.filter((l) => l.description.trim()), ...p.items.map((pi: any) => ({ serviceId: pi.serviceId, description: pi.service.name, sacCode: pi.service.sacCode ?? '', quantity: pi.quantity, unit: pi.service.unit, unitPrice: pi.unitPrice ?? pi.service.basePrice, discountPercent: '', taxRate: pi.service.gstRate }))])
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    e.stopPropagation()
    const lines = items.filter((l) => l.description.trim())
    if (!party) return toast.error(inv ? 'Choose a customer' : 'Choose a lead or a customer')
    if (!lines.length) return toast.error('Add at least one line')
    setBusy(true)
    try {
      const body: any = { [ptype === 'c' ? 'customerId' : 'leadId']: pid, issueDate, [inv ? 'dueDate' : 'validUntil']: second, notes, terms, items: lines.map((l) => ({ ...l, quantity: Number(l.quantity || 0), unitPrice: Number(l.unitPrice || 0), discountPercent: Number(l.discountPercent || 0), taxRate: Number(l.taxRate ?? 18) })) }
      if (inv) body.projectId = initial?.projectId ?? preset?.projectId ?? ''
      const path = inv ? '/invoices' : '/quotations'
      const saved = initial ? await api(`${path}/${initial.id}`, { method: 'PATCH', body }) : await api(path, { body })
      toast.success(initial ? 'Changes saved' : inv ? 'Invoice saved as a draft' : 'Quotation saved as a draft')
      onSaved(saved)
      onClose()
    } catch (err) { toast.error((err as Error).message) } finally { setBusy(false) }
  }

  const cell = 'h-8 rounded-md px-2 text-[13px]'
  return (
    <Dialog open={open} onClose={onClose} size="xl" title={initial ? `Edit ${kind}` : `New ${kind}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="doc-editor" loading={busy}>{initial ? 'Save changes' : 'Save as draft'}</Button></>}>
      <form id="doc-editor" onSubmit={save} className="space-y-4">
        <div className="grid gap-3.5 sm:grid-cols-4">
          <Field label={inv ? 'Customer' : 'Lead or customer'} className="sm:col-span-2">
            <Select value={party} onChange={(e) => setParty(e.target.value)} required>
              <option value="">Select…</option>
              {!inv && leads.length > 0 && <optgroup label="Leads">{leads.map((l) => <option key={l.id} value={`l:${l.id}`}>{leadLabel(l)}{l.state ? ` (${l.state})` : ''}</option>)}</optgroup>}
              <optgroup label="Customers">{customers.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.name}{c.billingState ? ` (${c.billingState})` : ''}</option>)}</optgroup>
              {initial?.lead && !leads.some((l) => l.id === initial.lead.id) && <option value={`l:${initial.lead.id}`}>{leadLabel(initial.lead)}</option>}
            </Select>
          </Field>
          <Field label="Date"><Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required /></Field>
          <Field label={inv ? 'Due date' : 'Valid until'} help={inv ? 'Empty uses the customer’s payment terms' : undefined}><Input type="date" value={second} onChange={(e) => setSecond(e.target.value)} /></Field>
        </div>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr><Th>Service or description</Th><Th>SAC</Th><Th right>Qty</Th><Th>Unit</Th><Th right>Rate (₹)</Th><Th right>Disc. %</Th><Th right>GST %</Th><Th right>Amount</Th><Th /></tr></thead>
            <tbody>
              {items.map((l, i) => (
                <tr key={i}>
                  <Td className="py-1.5"><Input className={cn(cell, 'min-w-52')} list="doc-services" value={l.description} onChange={(e) => pick(i, e.target.value)} aria-label="Description" /></Td>
                  <Td className="py-1.5"><Input className={cn(cell, 'w-20')} value={l.sacCode ?? ''} onChange={(e) => set(i, { sacCode: e.target.value })} aria-label="SAC code" /></Td>
                  <Td className="py-1.5"><Input className={cn(cell, 'w-16 text-right')} type="number" min="0" step="any" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} aria-label="Quantity" /></Td>
                  <Td className="py-1.5"><Input className={cn(cell, 'w-20')} value={l.unit ?? ''} onChange={(e) => set(i, { unit: e.target.value })} aria-label="Unit" /></Td>
                  <Td className="py-1.5"><Input className={cn(cell, 'w-28 text-right')} type="number" min="0" step="any" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} aria-label="Rate" /></Td>
                  <Td className="py-1.5"><Input className={cn(cell, 'w-16 text-right')} type="number" min="0" max="100" step="any" value={l.discountPercent ?? ''} onChange={(e) => set(i, { discountPercent: e.target.value })} aria-label="Discount percent" /></Td>
                  <Td className="py-1.5">
                    <Select className={cn(cell, 'w-20 pr-6')} value={String(l.taxRate ?? 18)} onChange={(e) => set(i, { taxRate: Number(e.target.value) })} aria-label="GST rate">
                      {[...new Set([...lookups.taxRates.map((t: any) => Number(t.rate)), Number(l.taxRate ?? 18)])].sort((a, b) => a - b).map((r) => <option key={r} value={r}>{r}%</option>)}
                    </Select>
                  </Td>
                  <Td right className="py-1.5">{inr(Number(l.quantity || 0) * Number(l.unitPrice || 0) * (1 - Number(l.discountPercent || 0) / 100), true)}</Td>
                  <Td className="py-1.5">{items.length > 1 && <Button size="icon" variant="ghost" aria-label="Remove line" onClick={() => setItems((list) => list.filter((_, n) => n !== i))}><X size={15} /></Button>}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <datalist id="doc-services">{lookups.services.map((s: any) => <option key={s.id} value={s.name} />)}</datalist>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setItems((l) => [...l, blank()])}><Plus size={14} />Add line</Button>
            {!inv && lookups.packages.length > 0 && (
              <Select className="h-7 w-auto rounded-md text-[13px]" value="" onChange={(e) => addPackage(e.target.value)} aria-label="Add a package">
                <option value="">Add a package…</option>
                {lookups.packages.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            )}
          </div>
          <div className="w-full max-w-xs text-[13.5px]">
            <div className="flex justify-between py-0.5"><span className="text-muted">Taxable value</span><span className="num">{inr(totals.taxable, true)}</span></div>
            <div className="flex justify-between py-0.5"><span className="text-muted">{!party ? 'GST' : exportSale ? 'GST (export, zero-rated)' : interState ? 'IGST' : 'CGST + SGST'}</span><span className="num">{inr(totals.cgst + totals.sgst + totals.igst, true)}</span></div>
            <div className="mt-1 flex justify-between border-t-2 border-ink pt-1.5 text-base font-semibold"><span>Total</span><span className="num">{inr(totals.total, true)}</span></div>
          </div>
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Notes for the customer"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <Field label="Terms"><Textarea rows={2} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Empty uses the default terms from Settings" /></Field>
        </div>
      </form>
    </Dialog>
  )
}
