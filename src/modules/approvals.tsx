'use client'
// Everything waiting for a decision, in one list, plus the requests you sent yourself.
import { Check, X } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { FormDialog } from '@/components/form'
import { Avatar, Badge, Button, Card, Empty, Loading, Panel, Status, Two } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { fmtDate, fmtShort, human, inr, leadLabel, personName } from '@/lib/format'
import { act } from './common'

const party = (q: any) => q.customer?.name ?? leadLabel(q.lead) ?? ''
const days = (n: any) => `${Number(n)} ${Number(n) === 1 ? 'day' : 'days'}`
const range = (a: string, b: string) => (a.slice(0, 10) === b.slice(0, 10) ? fmtDate(a) : `${fmtShort(a)} to ${fmtDate(b)}`)

function Row({ who, title, sub, amount, kind, onApprove, onReject }: { who: string; title: React.ReactNode; sub: React.ReactNode; amount?: React.ReactNode; kind: string; onApprove: () => void; onReject: () => void }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
      <Avatar name={who} className="h-9 w-9 text-[12px]" />
      <div className="min-w-0 flex-1"><Two top={<span className="flex flex-wrap items-center gap-2">{title}<Badge tone="mute">{kind}</Badge></span>} bottom={sub} /></div>
      {amount && <span className="num font-semibold">{amount}</span>}
      <span className="flex gap-2">
        <Button size="sm" variant="primary" onClick={onApprove}><Check size={14} />Approve</Button>
        <Button size="sm" onClick={onReject}><X size={14} />Reject</Button>
      </span>
    </li>
  )
}

export default function Approvals() {
  const { data, reload } = useApi<any>('/approvals')
  const [rejectQuote, setRejectQuote] = useState<any>(null)
  if (!data) return <Loading />
  const w = data.waiting
  const go = async (path: string, done: string, body: any = {}) => { if (await act(() => api(path, { body }), done)) reload() }
  const mine = [
    ...data.mine.quotations.map((q: any) => ({ key: q.id, at: q.updatedAt, what: `Quotation ${q.quotationNumber}`, sub: `${party(q)}, ${inr(q.totalAmount)}`, status: q.status, note: q.rejectionNote, href: '/quotations' })),
    ...data.mine.leave.map((l: any) => ({ key: l.id, at: l.createdAt, what: `${l.leaveType.name}, ${days(l.days)}`, sub: range(l.startDate, l.endDate), status: l.status, note: l.approver ? `Decided by ${personName(l.approver)}` : null, href: '/profile' })),
    ...data.mine.expenses.map((x: any) => ({ key: x.id, at: x.updatedAt, what: x.description, sub: `${x.category.name}, ${inr(Number(x.amount) + Number(x.taxAmount))}`, status: x.status, note: null, href: '/finance' })),
  ].sort((a, b) => b.at.localeCompare(a.at))
  const decides = data.canDecide.quotations || data.canDecide.leave || data.canDecide.expenses
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {decides ? (
        <Panel title={<span className="flex items-center gap-2">Waiting for you{data.count > 0 && <Badge tone="bad">{data.count}</Badge>}</span>}>
          {!data.count && <Empty>Nothing is waiting for you. New requests appear here and in your notifications.</Empty>}
          <ul className="divide-y divide-line">
            {w.quotations.map((q: any) => (
              <Row key={q.id} kind="Quotation" who={personName(q.preparedBy)} title={<Link href="/quotations" className="hover:underline">Quotation {q.quotationNumber}</Link>}
                sub={<>{party(q)}{q.title ? `, ${q.title}` : ''}. Sent by {personName(q.preparedBy)}{Number(q.discountTotal) > 0 ? `, discount ${inr(q.discountTotal)}` : ''}.</>}
                amount={inr(q.totalAmount)} onApprove={() => go(`/quotations/${q.id}/approve`, 'Quotation approved')} onReject={() => setRejectQuote(q)} />
            ))}
            {w.leave.map((l: any) => (
              <Row key={l.id} kind={l.leaveType.isPaid ? 'Leave' : 'Unpaid leave'} who={personName(l.employee)} title={`${personName(l.employee)} asks for ${days(l.days)}`}
                sub={<>{l.leaveType.name}, {range(l.startDate, l.endDate)}{l.reason ? `. ${l.reason}` : ''}</>}
                onApprove={() => go(`/hr/leave-requests/${l.id}/approve`, 'Leave approved')} onReject={() => go(`/hr/leave-requests/${l.id}/reject`, 'Leave rejected')} />
            ))}
            {w.expenses.map((x: any) => (
              <Row key={x.id} kind="Expense" who={personName(x.createdBy ?? x.paidBy) || 'Someone'} title={x.description}
                sub={<><span className="num">{x.expenseNumber}</span>, {x.category.name}{x.vendor ? `, ${x.vendor.name}` : ''}{x.project ? `, ${x.project.name}` : ''}{x.createdBy ? `. Added by ${personName(x.createdBy)}` : ''}</>}
                amount={inr(Number(x.amount) + Number(x.taxAmount))} onApprove={() => go(`/finance/expenses/${x.id}/approve`, 'Expense approved')} onReject={() => go(`/finance/expenses/${x.id}/reject`, 'Expense rejected')} />
            ))}
          </ul>
        </Panel>
      ) : (
        <Card className="p-5 text-sm text-muted">Your role does not decide on requests. Your own requests and their answers are listed here.</Card>
      )}
      <Panel title="Your requests">
        {!mine.length && <Empty>Leave, expenses and quotations you send for approval in the last 60 days appear here.</Empty>}
        <ul className="divide-y divide-line">
          {mine.map((m) => (
            <li key={m.key} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <Two top={<Link href={m.href} className="hover:underline">{m.what}</Link>} bottom={<>{m.sub}{m.note ? <span className="block">{m.note}</span> : null}</>} />
              <Status value={m.status} label={m.status === 'PENDING' || m.status === 'PENDING_APPROVAL' || m.status === 'SUBMITTED' ? 'Waiting' : human(m.status)} />
            </li>
          ))}
        </ul>
      </Panel>
      <FormDialog open={!!rejectQuote} onClose={() => setRejectQuote(null)} title={`Reject quotation ${rejectQuote?.quotationNumber ?? ''}`} submitLabel="Reject" size="sm"
        fields={[{ name: 'note', label: 'What should change', type: 'textarea', required: true, full: true }]}
        onSubmit={async (v) => { await api(`/quotations/${rejectQuote.id}/reject`, { body: v }); reload() }} />
    </div>
  )
}
