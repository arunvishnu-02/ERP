'use client'
import { money, PageTitle } from '@/components/portal'
import { Card, Empty, Loading, Status } from '@/components/ui'
import { useApi } from '@/lib/api'
import { fmtDate } from '@/lib/format'

export default function PortalQuotations() {
  const { data } = useApi<{ items: any[] }>('/portal/quotations')
  if (!data) return <Loading />
  return (
    <>
      <PageTitle title="Quotations" intro="Open a quotation to read it, print it, or accept it." />
      <Card>
        {data.items.length ? <ul className="divide-y divide-line">
          {data.items.map((q) => {
            const open = ['SENT', 'VIEWED'].includes(q.status)
            return (
              <li key={q.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0"><span className="block font-medium">{q.title || 'Quotation'}</span><span className="text-xs text-muted"><span className="num">{q.quotationNumber}</span>, {fmtDate(q.issueDate)}{open ? `, valid until ${fmtDate(q.validUntil)}` : ''}</span></span>
                <span className="flex items-center gap-3"><span className="num font-semibold">{money(q.totalAmount)}</span><Status value={q.status} label={q.status === 'VIEWED' ? 'Waiting for you' : q.status === 'SENT' ? 'New' : undefined} />
                  {q.link && <a href={q.link} className={open ? 'rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-ink' : 'rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium'}>{open ? 'Review' : 'View'}</a>}</span>
              </li>
            )
          })}
        </ul> : <Empty>No quotations yet.</Empty>}
      </Card>
    </>
  )
}
