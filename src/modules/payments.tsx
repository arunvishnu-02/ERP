'use client'
import { MessageCircle, Printer } from 'lucide-react'
import { useState } from 'react'
import { Resource } from '@/components/resource'
import { Badge, Button, Card, Empty, StatBand, Table, Tabs, Td, Th } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { fmtDate, human, inr, personName, waLink } from '@/lib/format'
import { act } from './common'
import { InvoiceSheet, PaymentDialog } from './invoices'

function Pending() {
  const { can, lookups } = useAuth()
  const { data, reload } = useApi<any>('/payments/pending')
  const [pay, setPay] = useState<any>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  if (!data) return null
  const b = data.buckets
  return (
    <div className="space-y-3">
      <StatBand items={[{ label: 'Not yet due', value: inr(b.notDue) }, { label: 'Overdue up to 15 days', value: inr(b.upTo15) }, { label: 'Overdue 16 to 30 days', value: inr(b.upTo30), tone: b.upTo30 ? 'bad' : undefined }, { label: 'Overdue more than 30 days', value: inr(b.over30), tone: b.over30 ? 'bad' : undefined }]} />
      <Card className="overflow-hidden">
        {!data.items.length ? <Empty>Nothing is waiting to be paid.</Empty> : (
          <Table>
            <thead><tr><Th>Invoice</Th><Th>Customer</Th><Th>Due</Th><Th right>Balance</Th><Th /></tr></thead>
            <tbody>{data.items.map((i: any) => {
              const c = i.customer.contacts[0]
              const phone = c?.whatsappNumber ?? c?.phone ?? i.customer.phone
              return (
                <tr key={i.id} className="cursor-pointer hover:bg-surface-2/50" onClick={() => setOpenId(i.id)}>
                  <Td className="num font-medium">{i.invoiceNumber}</Td><Td>{i.customer.name}</Td>
                  <Td>{i.daysOverdue ? <Badge tone="bad">{i.daysOverdue} d overdue</Badge> : <span className="text-muted">{fmtDate(i.dueDate)}</span>}</Td><Td right>{inr(i.balanceDue, true)}</Td>
                  <Td onClick={(e) => e.stopPropagation()}><div className="flex justify-end gap-1">
                    {phone && <Button size="sm" onClick={() => window.open(waLink(phone, `Hi ${c ? personName(c).split(' ')[0] : ''}, a reminder from ${lookups.organization.name}: invoice ${i.invoiceNumber} for ${inr(i.balanceDue)} was due on ${fmtDate(i.dueDate)}.`), '_blank', 'noopener')}><MessageCircle size={14} />WhatsApp</Button>}
                    {can('INVOICES', 'EDIT') && <Button size="sm" onClick={() => act(async () => { const r = await api(`/invoices/${i.id}/remind`, { method: 'POST' }); if (!r.sent) throw new Error(r.error) }, 'Reminder emailed')}>Email reminder</Button>}
                    {can('PAYMENTS', 'CREATE') && <Button size="sm" variant="primary" onClick={() => setPay(i)}>Record payment</Button>}
                  </div></Td>
                </tr>
              )
            })}</tbody>
          </Table>
        )}
      </Card>
      <PaymentDialog invoice={pay} open={!!pay} onClose={() => setPay(null)} onSaved={reload} />
      <InvoiceSheet id={openId} onClose={() => setOpenId(null)} onChanged={reload} />
    </div>
  )
}

export default function Payments() {
  const [tab, setTab] = useState('pending')
  return (
    <div className="space-y-3">
      <Tabs value={tab} onChange={setTab} options={[{ value: 'pending', label: 'Pending' }, { value: 'received', label: 'Received' }]} />
      {tab === 'pending' ? <Pending /> : (
        <Resource path="/payments" module="PAYMENTS" noun="payment" search="Search receipt, reference or customer" exportName="payments" canCreate={false}
          empty="No payments recorded yet. Open an unpaid invoice and choose Record payment."
          rowActions={(r) => <Button size="icon" variant="ghost" aria-label="Print receipt" onClick={() => window.open(`/print/receipt/${r.id}`, '_blank')}><Printer size={15} /></Button>}
          columns={[
            { header: 'Receipt', cell: (r) => <span className="num font-medium">{r.receiptNumber}</span>, text: (r) => r.receiptNumber }, { header: 'Date', cell: (r) => fmtDate(r.paymentDate), text: (r) => r.paymentDate.slice(0, 10) },
            { header: 'Customer', cell: (r) => r.customer.name, text: (r) => r.customer.name }, { header: 'Against', cell: (r) => <span className="num">{r.allocations.map((a: any) => a.invoice.invoiceNumber).join(', ')}</span>, text: (r) => r.allocations.map((a: any) => a.invoice.invoiceNumber).join(', ') },
            { header: 'Mode', cell: (r) => human(r.method), text: (r) => human(r.method) }, { header: 'Reference', cell: (r) => <span className="num text-muted">{r.referenceNumber}</span>, text: (r) => r.referenceNumber },
            { header: 'Received', right: true, cell: (r) => inr(r.amount, true), text: (r) => r.amount }, { header: 'TDS', right: true, cell: (r) => (r.tdsAmount ? inr(r.tdsAmount, true) : ''), text: (r) => r.tdsAmount },
          ]} />
      )}
    </div>
  )
}
