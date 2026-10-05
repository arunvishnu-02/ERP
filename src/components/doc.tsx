'use client'
import { Plus, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { amountInWords, computeDoc, day, fmtDate, gstOff, inr, leadLabel, personName, plusDays, todayStr, type Line } from '@/lib/format'
import { InfoStrip, Label, Paper, PaperHeader, Signatures, UpiQr } from './paper'
import { Button, cn, Dialog, Field, Input, Select, Status, Table, Td, Textarea, Th } from './ui'

type Kind = 'quotation' | 'invoice'

/** The document as the customer sees it, in the company's house style. Used in the app, on the public link and for printing. */
export function DocView({ kind, doc, org }: { kind: Kind; doc: any; org: any }) {
  const inv = kind === 'invoice'
  const c = doc.customer
  const s = org.settings ?? {}
  const noGst = gstOff(org)
  const taxed = doc.cgstAmount + doc.sgstAmount + doc.igstAmount > 0
  const draftNo = inv && String(doc.invoiceNumber).startsWith('DRAFT-')
  const discounted = doc.items.some((i: any) => Number(i.discountPercent) > 0)
  const showSac = !noGst && doc.items.some((i: any) => i.sacCode)
  const settledLines = inv && doc.status !== 'DRAFT'
  const due = settledLines ? doc.balanceDue : doc.totalAmount
  const title = inv ? (noGst || !org.gstin ? 'INVOICE' : 'TAX INVOICE') : 'QUOTATION'
  const party = c ? c.name : leadLabel(doc.lead)
  const address = c ? [c.billingAddressLine1, c.billingAddressLine2, c.billingCity, c.billingState, c.billingPincode].filter(Boolean).join(', ') : [doc.lead?.city, doc.lead?.state].filter(Boolean).join(', ')
  const row = (label: string, value: number, cls = '') => <div className={cn('flex justify-between gap-6 py-1', cls)}><span>{label}</span><span className="num">{inr(value, true)}</span></div>
  return (
    <Paper org={org}>
      <PaperHeader org={org} title={title}>
        <div className="no-print mt-2"><Status value={doc.overdue ? 'OVERDUE' : doc.status} /></div>
      </PaperHeader>
      <InfoStrip items={[
        [inv ? 'Invoice no.' : 'Quotation no.', draftNo ? 'Given when sent' : inv ? doc.invoiceNumber : `${doc.quotationNumber}${doc.revision > 1 ? ` (rev ${doc.revision})` : ''}`],
        ['Date', fmtDate(doc.issueDate)],
        [inv ? 'Due date' : 'Valid until', fmtDate(inv ? doc.dueDate : doc.validUntil)],
        inv ? ['Payment terms', doc.paymentTermsDays ? `Due in ${doc.paymentTermsDays} days` : 'On receipt'] : ['Project', doc.title],
      ]} />
      <div className="flex flex-wrap items-stretch justify-between gap-5">
        <div className="min-w-0 flex-1 text-[12.5px]">
          <Label>{inv ? 'Bill to' : 'Prepared for'}</Label>
          <div className="mt-1 text-[15px] font-semibold">{party}</div>
          {!c && doc.lead && personName(doc.lead) !== party && <div>{personName(doc.lead)}</div>}
          {address && <div className="text-[var(--doc-muted)]">{address}</div>}
          {c?.phone && <div className="text-[var(--doc-muted)]">{c.phone}</div>}
          {c?.email && <div className="text-[var(--doc-muted)]">{c.email}</div>}
          {!noGst && c?.gstin && <div className="mt-0.5">GSTIN <span className="num">{c.gstin}</span></div>}
          {!noGst && (taxed || doc.taxableAmount > 0) && <div className="mt-0.5 text-[var(--doc-muted)]">Place of supply: {c?.billingState ?? doc.lead?.state ?? org.state ?? ''}{!taxed && doc.taxableAmount > 0 ? ' (export of services, zero-rated)' : ''}</div>}
        </div>
        <div className="flex w-full flex-col justify-center rounded-xl bg-[var(--doc-navy)] px-6 py-4 text-white sm:w-60">
          <div className="text-[11px] text-white/70">{inv ? (settledLines && doc.balanceDue <= 0 ? 'Paid in full' : 'Amount due') : 'Quoted total'}</div>
          <div className="num mt-0.5 text-[26px] leading-tight font-bold">{inr(due, true)}</div>
          <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-white/80"><span className="h-1.5 w-1.5 rounded-full bg-[var(--doc-cyan)]" />{inv ? `By ${fmtDate(doc.dueDate)}` : `Valid until ${fmtDate(doc.validUntil)}`}</div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-0 text-[12.5px]">
          <thead>
            <tr className="text-left text-[11px] text-white">
              <th className="rounded-l-md bg-[var(--doc-navy)] py-2.5 pr-2 pl-3 font-semibold">#</th>
              <th className="bg-[var(--doc-navy)] px-2 py-2.5 font-semibold">Description</th>
              {showSac && <th className="bg-[var(--doc-navy)] px-2 py-2.5 font-semibold">SAC</th>}
              <th className="bg-[var(--doc-navy)] px-2 py-2.5 text-right font-semibold">Qty</th>
              <th className="bg-[var(--doc-navy)] px-2 py-2.5 text-right font-semibold">Rate</th>
              {discounted && <th className="bg-[var(--doc-navy)] px-2 py-2.5 text-right font-semibold">Disc.</th>}
              {taxed && <th className="bg-[var(--doc-navy)] px-2 py-2.5 text-right font-semibold">GST</th>}
              <th className="rounded-r-md bg-[var(--doc-navy)] py-2.5 pr-3 pl-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((i: any, n: number) => (
              <tr key={i.id ?? n} className="align-top">
                <td className="num border-b border-[var(--doc-line)] py-3 pr-2 pl-3 text-[var(--doc-muted)]">{n + 1}</td>
                <td className="border-b border-[var(--doc-line)] px-2 py-3 font-medium whitespace-pre-wrap">{i.description}</td>
                {showSac && <td className="num border-b border-[var(--doc-line)] px-2 py-3 text-[var(--doc-muted)]">{i.sacCode}</td>}
                <td className="num border-b border-[var(--doc-line)] px-2 py-3 text-right whitespace-nowrap">{i.quantity}{i.unit && i.unit !== 'nos' ? ` ${i.unit}` : ''}</td>
                <td className="num border-b border-[var(--doc-line)] px-2 py-3 text-right whitespace-nowrap">{inr(i.unitPrice, true)}</td>
                {discounted && <td className="num border-b border-[var(--doc-line)] px-2 py-3 text-right">{Number(i.discountPercent) ? `${i.discountPercent}%` : ''}</td>}
                {taxed && <td className="num border-b border-[var(--doc-line)] px-2 py-3 text-right">{i.taxRate}%</td>}
                <td className="num border-b border-[var(--doc-line)] py-3 pr-3 pl-2 text-right font-semibold whitespace-nowrap">{inr(i.taxableAmount, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 flex-1 text-[12px]">
          <Label>Amount in words</Label>
          <div className="mt-1 font-semibold">{amountInWords(doc.totalAmount)}</div>
        </div>
        <div className="w-full text-[12.5px] sm:w-72">
          {(doc.discountTotal > 0 || taxed) && row('Sub total', doc.subtotal ?? doc.taxableAmount)}
          {doc.discountTotal > 0 && row('Discount', -doc.discountTotal)}
          {taxed && (doc.igstAmount > 0 ? row('IGST', doc.igstAmount) : <>{row('CGST', doc.cgstAmount)}{row('SGST', doc.sgstAmount)}</>)}
          {row('Total', doc.totalAmount, 'mt-1 rounded-md bg-[var(--doc-tint)] px-3 py-2 text-[14px] font-bold')}
          {settledLines && (doc.amountPaid + doc.tdsAmount > 0 || doc.creditedAmount > 0) && <>
            {row(doc.tdsAmount > 0 ? 'Received, including TDS' : 'Amount paid', doc.amountPaid + doc.tdsAmount, 'px-3')}
            {doc.creditedAmount > 0 && row('Credit notes', doc.creditedAmount, 'px-3')}
            {row('Balance due', doc.balanceDue, 'px-3 font-semibold')}
          </>}
        </div>
      </div>
      {inv && (s.bankDetails || s.upiId) && (
        <div className="flex flex-wrap items-center gap-5 rounded-xl border border-[var(--doc-line)] px-5 py-4">
          <div className="min-w-0 flex-1 text-[12px]">
            <Label>Payment details</Label>
            {s.bankDetails && <p className="mt-1 leading-relaxed whitespace-pre-wrap">{s.bankDetails}</p>}
            {s.upiId && <p className="mt-1">UPI ID: <span className="font-semibold">{s.upiId}</span></p>}
          </div>
          {s.upiId && doc.balanceDue !== 0 && (
            <div className="flex items-center gap-3">
              <UpiQr upiId={s.upiId} name={org.legalName || org.name} amount={settledLines ? doc.balanceDue : doc.totalAmount} note={draftNo ? undefined : doc.invoiceNumber} />
              <div className="max-w-24 text-[10.5px] text-[var(--doc-muted)]">Scan with any UPI app to pay</div>
            </div>
          )}
        </div>
      )}
      {(doc.notes || doc.terms) && (
        <div className="grid gap-4 text-[11.5px] sm:grid-cols-2">
          {doc.notes && <div><Label>Notes</Label><p className="mt-1 whitespace-pre-wrap">{doc.notes}</p></div>}
          {doc.terms && <div className={doc.notes ? '' : 'sm:col-span-2'}><Label>Terms and conditions</Label><p className="mt-1 whitespace-pre-wrap text-[var(--doc-muted)]">{doc.terms}</p></div>}
        </div>
      )}
      <Signatures org={org} client={inv ? undefined : 'Accepted by client'} />
    </Paper>
  )
}

const blank = (): Line => ({ description: '', sacCode: '', quantity: 1, unit: 'nos', unitPrice: '', discountPercent: '', taxRate: 18 })
export interface DocPreset { party?: string; projectId?: string; items?: Line[]; notes?: string }

/** Create or edit a quotation or invoice, with a live total (and GST, when the company is registered). */
export function DocEditor({ kind, open, onClose, initial, preset, onSaved }: { kind: Kind; open: boolean; onClose: () => void; initial?: any; preset?: DocPreset; onSaved: (doc: any) => void }) {
  const { lookups, can } = useAuth()
  const inv = kind === 'invoice'
  const customers = useApi<{ items: any[] }>(open && can('CUSTOMERS') ? '/customers?limit=500' : null).data?.items ?? []
  const leads = useApi<{ items: any[] }>(open && !inv && can('LEADS') ? '/leads?status=OPEN&limit=500' : null).data?.items ?? []
  const [party, setParty] = useState('')
  const [issueDate, setIssueDate] = useState(todayStr())
  const [second, setSecond] = useState('')
  const [title, setTitle] = useState('')
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
    setTitle(d?.title ?? '')
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
  const noGst = gstOff(lookups.organization)
  const totals = useMemo(() => computeDoc(items, { interState, exportSale, noGst }), [items, interState, exportSale, noGst])
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
      const body: any = { [ptype === 'c' ? 'customerId' : 'leadId']: pid, issueDate, [inv ? 'dueDate' : 'validUntil']: second, notes, terms, items: lines.map((l) => ({ ...l, quantity: Number(l.quantity || 0), unitPrice: Number(l.unitPrice || 0), discountPercent: Number(l.discountPercent || 0), taxRate: noGst ? 0 : Number(l.taxRate ?? 18) })) }
      if (inv) body.projectId = initial?.projectId ?? preset?.projectId ?? ''
      else body.title = title
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
          {!inv && <Field label="Project or subject" className="sm:col-span-4"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="E-commerce website" /></Field>}
        </div>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr><Th>Service or description</Th>{!noGst && <Th>SAC</Th>}<Th right>Qty</Th><Th>Unit</Th><Th right>Rate (₹)</Th><Th right>Disc. %</Th>{!noGst && <Th right>GST %</Th>}<Th right>Amount</Th><Th /></tr></thead>
            <tbody>
              {items.map((l, i) => (
                <tr key={i}>
                  <Td className="py-1.5"><Input className={cn(cell, 'min-w-52')} list="doc-services" value={l.description} onChange={(e) => pick(i, e.target.value)} aria-label="Description" /></Td>
                  {!noGst && <Td className="py-1.5"><Input className={cn(cell, 'w-20')} value={l.sacCode ?? ''} onChange={(e) => set(i, { sacCode: e.target.value })} aria-label="SAC code" /></Td>}
                  <Td className="py-1.5"><Input className={cn(cell, 'w-16 text-right')} type="number" min="0" step="any" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} aria-label="Quantity" /></Td>
                  <Td className="py-1.5"><Input className={cn(cell, 'w-20')} value={l.unit ?? ''} onChange={(e) => set(i, { unit: e.target.value })} aria-label="Unit" /></Td>
                  <Td className="py-1.5"><Input className={cn(cell, 'w-28 text-right')} type="number" min="0" step="any" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} aria-label="Rate" /></Td>
                  <Td className="py-1.5"><Input className={cn(cell, 'w-16 text-right')} type="number" min="0" max="100" step="any" value={l.discountPercent ?? ''} onChange={(e) => set(i, { discountPercent: e.target.value })} aria-label="Discount percent" /></Td>
                  {!noGst && <Td className="py-1.5">
                    <Select className={cn(cell, 'w-20 pr-6')} value={String(l.taxRate ?? 18)} onChange={(e) => set(i, { taxRate: Number(e.target.value) })} aria-label="GST rate">
                      {[...new Set([...lookups.taxRates.map((t: any) => Number(t.rate)), Number(l.taxRate ?? 18)])].sort((a, b) => a - b).map((r) => <option key={r} value={r}>{r}%</option>)}
                    </Select>
                  </Td>}
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
            {!noGst && <>
              <div className="flex justify-between py-0.5"><span className="text-muted">Taxable value</span><span className="num">{inr(totals.taxable, true)}</span></div>
              <div className="flex justify-between py-0.5"><span className="text-muted">{!party ? 'GST' : exportSale ? 'GST (export, zero-rated)' : interState ? 'IGST' : 'CGST + SGST'}</span><span className="num">{inr(totals.cgst + totals.sgst + totals.igst, true)}</span></div>
            </>}
            {noGst && totals.discount > 0 && <div className="flex justify-between py-0.5"><span className="text-muted">Discount</span><span className="num">{inr(-totals.discount, true)}</span></div>}
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
