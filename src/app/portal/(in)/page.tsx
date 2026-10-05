'use client'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { money, PageTitle, usePortal } from '@/components/portal'
import { Card, Loading, Status } from '@/components/ui'
import { useApi } from '@/lib/api'
import { fmtDate } from '@/lib/format'

function Block({ title, href, empty, children, count }: { title: string; href: string; empty: string; children: React.ReactNode; count: number }) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between"><h2 className="font-display text-[15px] font-semibold">{title}</h2><Link href={href} className="flex items-center gap-1 text-[13px] text-accent hover:underline">See all<ArrowRight size={14} /></Link></div>
      {count ? <ul className="divide-y divide-line text-sm">{children}</ul> : <p className="py-3 text-sm text-muted">{empty}</p>}
    </Card>
  )
}

export default function PortalHome() {
  const me = usePortal()
  const { data } = useApi<any>('/portal/home')
  if (!data) return <Loading />
  return (
    <>
      <PageTitle title={`Hello, ${me.contact.firstName}`} intro={`Everything ${me.organization.name} is doing for ${me.customer.name}, in one place.`} />
      <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
        <Card className="p-3 sm:p-4"><div className="text-xs text-muted sm:text-[13px]">To pay</div><div className="num mt-1 text-lg font-semibold sm:text-2xl">{money(data.balanceDue)}</div><div className="text-xs text-muted">{data.unpaid.length} unpaid invoice{data.unpaid.length === 1 ? '' : 's'}</div></Card>
        <Card className="p-3 sm:p-4"><div className="text-xs text-muted sm:text-[13px]">Waiting for your decision</div><div className="num mt-1 text-lg font-semibold sm:text-2xl">{data.toDecide.length}</div><div className="text-xs text-muted">quotation{data.toDecide.length === 1 ? '' : 's'}</div></Card>
        <Card className="p-3 sm:p-4"><div className="text-xs text-muted sm:text-[13px]">Open support tickets</div><div className="num mt-1 text-lg font-semibold sm:text-2xl">{data.tickets.length}</div><div className="text-xs text-muted">{data.projects.length} active project{data.projects.length === 1 ? '' : 's'}</div></Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Block title="Quotations to review" href="/portal/quotations" empty="Nothing waiting for you." count={data.toDecide.length}>
          {data.toDecide.map((q: any) => <li key={q.id} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0"><span className="block truncate font-medium">{q.title || q.quotationNumber}</span><span className="text-xs text-muted">Valid until {fmtDate(q.validUntil)}</span></span>{q.link && <a href={q.link} className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-ink">Review</a>}</li>)}
        </Block>
        <Block title="Invoices to pay" href="/portal/invoices" empty="All invoices are paid. Thank you." count={data.unpaid.length}>
          {data.unpaid.map((i: any) => <li key={i.id} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0"><span className="num block font-medium">{i.invoiceNumber}</span><span className="text-xs text-muted">Due {fmtDate(i.dueDate)}</span></span><span className="flex shrink-0 items-center gap-2"><span className="num font-semibold">{money(i.balanceDue)}</span>{i.link && <a href={i.link} className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium">View and pay</a>}</span></li>)}
        </Block>
        <Block title="Projects" href="/portal/projects" empty="No active projects." count={data.projects.length}>
          {data.projects.map((p: any) => <li key={p.id} className="py-2"><div className="flex items-center justify-between gap-3"><span className="truncate font-medium">{p.name}</span><Status value={p.status} /></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${p.progressPercent}%` }} /></div></li>)}
        </Block>
        <Block title="Support" href="/portal/support" empty="No open tickets. Need help? Open one from Support." count={data.tickets.length}>
          {data.tickets.map((t: any) => <li key={t.id}><Link href={`/portal/support/${t.id}`} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0"><span className="block truncate font-medium">{t.subject}</span><span className="num text-xs text-muted">{t.ticketNumber}</span></span><Status value={t.status} /></Link></li>)}
        </Block>
      </div>
    </>
  )
}
