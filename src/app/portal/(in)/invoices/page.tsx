'use client'
import { money, PageTitle } from '@/components/portal'
import { Card, Empty, Loading, Status } from '@/components/ui'
import { useApi } from '@/lib/api'
import { fmtDate } from '@/lib/format'

export default function PortalInvoices() {
  const { data } = useApi<{ items: any[] }>('/portal/invoices')
  if (!data) return <Loading />
  const due = data.items.filter((i) => ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'].includes(i.status)).reduce((n, i) => n + Number(i.balanceDue), 0)
  return (
    <>
      <PageTitle title="Invoices" intro={due ? `${money(due)} is still to pay. Open an invoice for the bank and UPI details.` : 'Everything is paid. Thank you.'} />
      <Card>
        {data.items.length ? <ul className="divide-y divide-line">
          {data.items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0"><span className="num block font-medium">{i.invoiceNumber}</span><span className="text-xs text-muted">{fmtDate(i.issueDate)}{i.project ? `, ${i.project.name}` : ''}{Number(i.balanceDue) > 0 ? `, due ${fmtDate(i.dueDate)}` : ''}</span></span>
              <span className="flex items-center gap-3 text-right">
                <span><span className="num block font-semibold">{money(i.totalAmount)}</span>{Number(i.balanceDue) > 0 && Number(i.balanceDue) < Number(i.totalAmount) && <span className="num text-xs text-muted">{money(i.balanceDue)} left</span>}</span>
                <Status value={i.status} />
                {i.link && <a href={i.link} className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium">{Number(i.balanceDue) > 0 ? 'View and pay' : 'View'}</a>}
              </span>
            </li>
          ))}
        </ul> : <Empty>No invoices yet.</Empty>}
      </Card>
    </>
  )
}
