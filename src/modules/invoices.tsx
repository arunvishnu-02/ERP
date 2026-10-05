'use client'
import { Plus, Printer, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { DocEditor, DocView, type DocPreset } from '@/components/doc'
import { ConfirmDialog, FormDialog, type Field } from '@/components/form'
import { Workflow } from '@/components/misc'
import { RecordPanel } from '@/components/record'
import { Resource } from '@/components/resource'
import { Button, Card, Empty, Panel, Sheet, Status, Table, Tabs, Td, Th, Two } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useUrlParam } from '@/lib/url'
import { fmtDate, gstOff, human, inr, options, todayStr } from '@/lib/format'
import { act, DueTag, useCustomerOptions } from './common'
import { SendDialog } from './quotations'

const number = (i: any) => (String(i.invoiceNumber).startsWith('DRAFT-') ? 'Draft' : i.invoiceNumber)
const shown = (i: any) => (i.overdue ? 'OVERDUE' : i.status)

/** Record money received against one invoice, with any TDS the customer deducted. */
export function PaymentDialog({ invoice, open, onClose, onSaved }: { invoice: any; open: boolean; onClose: () => void; onSaved: () => void }) {
  const { lookups } = useAuth()
  if (!invoice) return null
  return (
    <FormDialog open={open} onClose={onClose} title="Record payment" submitLabel="Record payment"
      intro={<p className="text-sm text-muted">Invoice <span className="num text-ink">{invoice.invoiceNumber}</span> for {invoice.customer?.name}. Balance due is <b className="num font-semibold text-ink">{inr(invoice.balanceDue, true)}</b>.</p>}
      initial={{ amount: invoice.balanceDue, tdsAmount: 0, paymentDate: todayStr(), method: 'BANK_TRANSFER', bankAccountId: lookups.bankAccounts.find((b: any) => b.isDefault)?.id ?? '' }}
      fields={[
        { name: 'amount', label: 'Amount received (₹)', type: 'number', required: true }, { name: 'tdsAmount', label: 'TDS deducted by customer (₹)', type: 'number' },
        { name: 'paymentDate', label: 'Payment date', type: 'date', required: true }, { name: 'method', label: 'Mode', type: 'select', options: options(lookups.enums.PaymentMethod), required: true },
        { name: 'referenceNumber', label: 'Reference or UTR number' }, { name: 'bankAccountId', label: 'Received in', type: 'select', options: lookups.bankAccounts.map((b: any) => ({ value: b.id, label: b.name })) },
        { name: 'notes', label: 'Notes', type: 'textarea' },
      ]}
      onSubmit={async (v) => {
        const { amount, tdsAmount, ...rest } = v
        const p = await api('/payments', { body: { ...rest, customerId: invoice.customerId, allocations: [{ invoiceId: invoice.id, amount: Number(amount || 0), tdsAmount: Number(tdsAmount || 0) }] } })
        toast.success(`Payment recorded. Receipt ${p.receiptNumber}`)
        onSaved()
      }} />
  )
}

export function InvoiceSheet({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { can, lookups } = useAuth()
  const noGst = gstOff(lookups.organization)
  const { data: inv, reload } = useApi<any>(id ? `/invoices/${id}` : null)
  const [dlg, setDlg] = useState<null | 'edit' | 'send' | 'pay' | 'credit' | 'void' | 'delete'>(null)
  const [tick, setTick] = useState(0)
  const open = !!id && inv?.id === id
  const changed = () => { reload(); setTick((t) => t + 1); onChanged() }
  const s = inv?.status
  const unpaid = ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'].includes(s)
  const edit = can('INVOICES', 'EDIT')
  return (
    <>
      <Sheet open={open} onClose={onClose} title={inv ? (s === 'DRAFT' ? 'Draft invoice' : `Invoice ${inv.invoiceNumber}`) : ''} subtitle={inv && <>{inv.customer.name}{inv.project ? `, ${inv.project.name}` : ''}</>}
        actions={inv && <>
          <Button onClick={() => window.open(`/print/invoice/${inv.id}`, '_blank')}><Printer size={15} />Print or PDF</Button>
          {s === 'DRAFT' && can('INVOICES', 'DELETE') && <Button variant="danger" onClick={() => setDlg('delete')}>Delete draft</Button>}
          {unpaid && can('INVOICES', 'DELETE') && inv.amountPaid + inv.tdsAmount === 0 && <Button variant="danger" onClick={() => setDlg('void')}>Void</Button>}
          {unpaid && can('INVOICES', 'CREATE') && <Button onClick={() => setDlg('credit')}>Credit note</Button>}
          {unpaid && edit && <Button onClick={() => act(async () => { const r = await api(`/invoices/${inv.id}/remind`, { method: 'POST' }); if (!r.sent) throw new Error(r.error) }, 'Reminder emailed').then(changed)}>Email a reminder</Button>}
          {s === 'DRAFT' && edit && <Button onClick={() => setDlg('edit')}>Edit</Button>}
          {edit && s !== 'VOID' && s !== 'PAID' && <Button variant={s === 'DRAFT' ? 'primary' : 'secondary'} onClick={() => setDlg('send')}>{s === 'DRAFT' ? 'Send invoice' : 'Send again'}</Button>}
          {unpaid && can('PAYMENTS', 'CREATE') && <Button variant="primary" onClick={() => setDlg('pay')}>Record payment</Button>}
        </>}>
        {inv && <>
          <Workflow step={s === 'PAID' ? 7 : s === 'DRAFT' ? 5 : 6} />
          <DocView kind="invoice" doc={inv} org={lookups.organization} />
          {(inv.paymentAllocations.length > 0 || inv.creditNotes.length > 0) && (
            <Panel title="Payments and credit notes">
              <ul className="divide-y divide-line text-sm">
                {inv.paymentAllocations.map((a: any) => <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"><span><span className="num font-medium">{a.payment.receiptNumber}</span><span className="text-muted">, {fmtDate(a.payment.paymentDate)}, {human(a.payment.method)}</span></span><span className="num">{inr(a.amount, true)}{a.tdsAmount > 0 ? <span className="text-muted"> + TDS {inr(a.tdsAmount, true)}</span> : ''}</span></li>)}
                {inv.creditNotes.map((c: any) => <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"><span><span className="num font-medium">{c.creditNoteNumber}</span><span className="text-muted">, credit note: {c.reason}</span></span><span className="num">{inr(c.totalAmount, true)}</span></li>)}
              </ul>
            </Panel>
          )}
          <RecordPanel entityType="INVOICE" entityId={inv.id} reloadKey={tick} tabs={['timeline', 'notes', 'files']} />
        </>}
      </Sheet>
      {inv && <>
        <DocEditor kind="invoice" open={dlg === 'edit'} onClose={() => setDlg(null)} initial={inv} onSaved={changed} />
        <SendDialog kind="invoice" doc={inv} open={dlg === 'send'} onClose={() => setDlg(null)} onSent={changed} />
        <PaymentDialog invoice={inv} open={dlg === 'pay'} onClose={() => setDlg(null)} onSaved={changed} />
        <FormDialog open={dlg === 'credit'} onClose={() => setDlg(null)} title="Issue a credit note" size="sm" submitLabel="Issue credit note"
          intro={<p className="text-sm text-muted">Reduces what the customer owes on this invoice.{noGst ? '' : ' GST is added in the same proportion as the invoice.'}</p>}
          fields={[{ name: 'amount', label: noGst ? 'Amount to credit (₹)' : 'Amount to credit, before GST (₹)', type: 'number', required: true, full: true }, { name: 'reason', label: 'Reason', type: 'textarea', required: true }]}
          onSubmit={async (v) => { const c = await api('/credit-notes', { body: { ...v, invoiceId: inv.id } }); toast.success(`Credit note ${c.creditNoteNumber} issued`); changed() }} />
        <ConfirmDialog open={dlg === 'void'} onClose={() => setDlg(null)} title="Void this invoice?" confirmLabel="Void invoice" danger onConfirm={async () => { await api(`/invoices/${inv.id}/void`, { method: 'POST' }); toast.success('Invoice voided'); changed() }}>The number {inv.invoiceNumber} stays used and the invoice is marked void. This cannot be undone.</ConfirmDialog>
        <ConfirmDialog open={dlg === 'delete'} onClose={() => setDlg(null)} title="Delete this draft?" confirmLabel="Delete draft" danger onConfirm={async () => { await api(`/invoices/${inv.id}`, { method: 'DELETE' }); toast.success('Draft deleted'); onChanged(); onClose() }}>The draft is removed. Nothing has been sent to the customer.</ConfirmDialog>
      </>}
    </>
  )
}

function Recurring() {
  const { can, lookups } = useAuth()
  const noGst = gstOff(lookups.organization)
  const customers = useCustomerOptions()
  const { data, reload } = useApi<{ items: any[] }>('/recurring-invoices')
  const [add, setAdd] = useState(false)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">A draft invoice is created on each due date for Accounts to review and send.</p>
        {can('INVOICES', 'CREATE') && <Button variant="primary" onClick={() => setAdd(true)}><Plus size={16} />Add recurring invoice</Button>}
      </div>
      <Card className="overflow-hidden">
        {!data?.items.length ? <Empty>No recurring invoices. Use them for retainers, AMCs and monthly services.</Empty> : (
          <Table>
            <thead><tr><Th>Customer</Th><Th>For</Th><Th right>{noGst ? 'Amount' : 'Amount before GST'}</Th><Th>Repeats</Th><Th>Next invoice</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>{data.items.map((r) => (
              <tr key={r.id}>
                <Td className="font-medium">{r.customer.name}</Td><Td>{r.title}</Td><Td right>{inr(r.items.reduce((a: number, i: any) => a + i.quantity * i.unitPrice, 0))}</Td><Td>{human(r.frequency)}</Td>
                <Td>{r.status === 'ENDED' ? <span className="text-muted">Ended</span> : <DueTag date={r.nextRunDate} done={r.status !== 'ACTIVE'} />}</Td><Td><Status value={r.status} /></Td>
                <Td><div className="flex justify-end gap-1">
                  {can('INVOICES', 'CREATE') && r.status !== 'ENDED' && <Button size="sm" onClick={() => act(() => api(`/recurring-invoices/${r.id}/run`, { method: 'POST' }), 'Draft invoice created').then(reload)}>Create now</Button>}
                  {can('INVOICES', 'EDIT') && r.status !== 'ENDED' && <Button size="sm" onClick={() => act(() => api(`/recurring-invoices/${r.id}`, { method: 'PATCH', body: { status: r.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' } })).then(reload)}>{r.status === 'ACTIVE' ? 'Pause' : 'Resume'}</Button>}
                  {can('INVOICES', 'DELETE') && <Button size="icon" variant="ghost" aria-label="Delete recurring invoice" onClick={() => act(() => api(`/recurring-invoices/${r.id}`, { method: 'DELETE' }), 'Deleted').then(reload)}><Trash2 size={15} /></Button>}
                </div></Td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
      <FormDialog open={add} onClose={() => setAdd(false)} title="Add recurring invoice" submitLabel="Add recurring invoice" initial={{ frequency: 'MONTHLY', startDate: todayStr(), quantity: 1, taxRate: noGst ? 0 : 18 }}
        fields={[
          { name: 'customerId', label: 'Customer', type: 'select', options: customers, required: true, full: true }, { name: 'title', label: 'What it is for', required: true, full: true, placeholder: 'Social media management' },
          { name: 'frequency', label: 'Repeats', type: 'select', options: options(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY']), required: true }, { name: 'startDate', label: 'First invoice on', type: 'date', required: true },
          { name: 'unitPrice', label: noGst ? 'Amount (₹)' : 'Amount before GST (₹)', type: 'number', required: true },
          ...(noGst ? [] : [{ name: 'taxRate', label: 'GST %', type: 'select', options: lookups.taxRates.map((t: any) => ({ value: String(t.rate), label: `${t.rate}%` })), required: true } as Field, { name: 'sacCode', label: 'SAC code' } as Field]),
          { name: 'endDate', label: 'Ends on (optional)', type: 'date' },
        ]}
        onSubmit={async (v) => { await api('/recurring-invoices', { body: { customerId: v.customerId, title: v.title, frequency: v.frequency, startDate: v.startDate, endDate: v.endDate, items: [{ description: v.title, quantity: 1, unitPrice: Number(v.unitPrice), taxRate: noGst ? 0 : Number(v.taxRate), sacCode: noGst ? '' : v.sacCode }] } }); toast.success('Recurring invoice added'); reload() }} />
    </div>
  )
}

export default function Invoices() {
  const [tab, setTab] = useState('invoices')
  const [openId, setOpenId] = useState<string | null>(null)
  useUrlParam('open', setOpenId)
  const [creating, setCreating] = useState<DocPreset | null>(null)
  const [rk, setRk] = useState(0)
  const refresh = () => setRk((k) => k + 1)
  return (
    <div className="space-y-3">
      <Tabs value={tab} onChange={setTab} options={[{ value: 'invoices', label: 'Invoices' }, { value: 'recurring', label: 'Recurring' }, { value: 'credit', label: 'Credit notes' }]} />
      {tab === 'invoices' && (
        <Resource path="/invoices" module="INVOICES" noun="invoice" search="Search number or customer" exportName="invoices" reloadKey={rk} canDelete={false} onOpen={(r) => setOpenId(r.id)} onCreate={() => setCreating({})}
          filter={{ param: 'status', options: [{ value: '', label: 'All' }, { value: 'DRAFT', label: 'Draft' }, { value: 'UNPAID', label: 'Unpaid' }, { value: 'OVERDUE', label: 'Overdue' }, { value: 'PAID', label: 'Paid' }] }}
          empty="No invoices yet. A draft is created when a billable milestone is completed, or you can add one here."
          columns={[
            { header: 'Invoice', cell: (r) => <Two top={<span className="num">{number(r)}</span>} bottom={r.project?.name} />, text: (r) => number(r) },
            { header: 'Customer', cell: (r) => r.customer.name, text: (r) => r.customer.name }, { header: 'Date', cell: (r) => fmtDate(r.issueDate), text: (r) => r.issueDate.slice(0, 10) },
            { header: 'Due', cell: (r) => (['PAID', 'DRAFT', 'VOID'].includes(r.status) ? <span className="text-muted">{fmtDate(r.dueDate)}</span> : <DueTag date={r.dueDate} />), text: (r) => r.dueDate.slice(0, 10) },
            { header: 'Taxable', exportOnly: true, cell: () => null, text: (r) => r.taxableAmount }, { header: 'CGST', exportOnly: true, cell: () => null, text: (r) => r.cgstAmount }, { header: 'SGST', exportOnly: true, cell: () => null, text: (r) => r.sgstAmount }, { header: 'IGST', exportOnly: true, cell: () => null, text: (r) => r.igstAmount },
            { header: 'Total', right: true, cell: (r) => inr(r.totalAmount), text: (r) => r.totalAmount }, { header: 'Balance', right: true, cell: (r) => inr(r.balanceDue), text: (r) => r.balanceDue },
            { header: 'Status', cell: (r) => <Status value={shown(r)} />, text: (r) => human(shown(r)) },
          ]} />
      )}
      {tab === 'recurring' && <Recurring />}
      {tab === 'credit' && (
        <Resource path="/credit-notes" module="INVOICES" noun="credit note" canDelete={false} canCreate={false} empty="No credit notes. Open a sent invoice to issue one."
          columns={[{ header: 'Credit note', cell: (r) => <span className="num font-medium">{r.creditNoteNumber}</span> }, { header: 'Invoice', cell: (r) => <span className="num">{r.invoice.invoiceNumber}</span> }, { header: 'Customer', cell: (r) => r.customer.name }, { header: 'Date', cell: (r) => fmtDate(r.issueDate) }, { header: 'Reason', cell: (r) => r.reason, className: 'max-w-72' }, { header: 'Amount', right: true, cell: (r) => inr(r.totalAmount, true) }]} />
      )}
      <DocEditor kind="invoice" open={!!creating} onClose={() => setCreating(null)} preset={creating ?? undefined} onSaved={(i) => { refresh(); setOpenId(i.id) }} />
      <InvoiceSheet id={openId} onClose={() => setOpenId(null)} onChanged={refresh} />
    </div>
  )
}
