'use client'
import Link from 'next/link'
import { useState } from 'react'
import { HBars, PairBars } from '@/components/misc'
import { Badge, Button, Card, Panel, StatBand } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { ago, fmtDateTime, human, inr, inrShort, leadLabel, personName } from '@/lib/format'
import { act, DueTag, ExpiryTag } from './common'
import { QuotationSheet } from './quotations'

function Attendance() {
  const { me } = useAuth()
  const { data, reload } = useApi<any>(me.employeeId ? '/me/hr' : null)
  if (!me.employeeId || !data) return null
  const a = data.attendance
  return (
    <Panel title="My attendance today" action={<Link href="/profile" className="text-[13px] text-accent hover:underline">Leave and profile</Link>}>
      {a?.checkInAt ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>Checked in at {fmtDateTime(a.checkInAt)}{a.checkOutAt ? `, out at ${fmtDateTime(a.checkOutAt)}` : ''}{a.status === 'WORK_FROM_HOME' ? ' (working from home)' : ''}</span>
          {!a.checkOutAt && <Button onClick={() => act(() => api('/me/check-out', { body: {} }), 'Checked out').then(reload)}>Check out</Button>}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => act(() => api('/me/check-in', { body: {} }), 'Checked in').then(reload)}>Check in</Button>
          <Button onClick={() => act(() => api('/me/check-in', { body: { workFromHome: true } }), 'Checked in from home').then(reload)}>Check in from home</Button>
        </div>
      )}
    </Panel>
  )
}

/** Shown to an administrator on a new installation, before any records exist. */
function StartHere() {
  const steps: [string, string, string][] = [
    ['Add your company details', 'Address, GSTIN, bank details and document prefix appear on quotations and invoices.', '/settings'],
    ['Add your team', 'Create a login for each person and give them a role.', '/settings'],
    ['Add your services', 'The services you sell, with prices, so quotations are quick to build.', '/quotations'],
    ['Add your first lead', 'Then follow it through quotation, project, invoice and payment.', '/leads'],
  ]
  return (
    <Panel title="Start here">
      <ol className="grid gap-3 sm:grid-cols-2">
        {steps.map(([title, text, href], i) => (
          <li key={title}>
            <Link href={href} className="flex h-full gap-3 rounded-lg border border-line p-3 hover:border-accent">
              <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{i + 1}</span>
              <span><span className="block font-medium">{title}</span><span className="text-[13px] text-muted">{text}</span></span>
            </Link>
          </li>
        ))}
      </ol>
    </Panel>
  )
}

export default function Dashboard() {
  const { can } = useAuth()
  const { data, reload } = useApi<any>('/dashboard')
  const [quotation, setQuotation] = useState<string | null>(null)
  if (!data) return null
  const kpi = (key: string) => data.kpis.find((k: any) => k.key === key)
  const fresh = can('SETTINGS') && kpi('leads')?.value === 0 && kpi('clients')?.value === 0
  return (
    <div className="space-y-4">
      {data.kpis.length > 0 && <StatBand items={data.kpis.map((k: any) => ({ label: k.label, value: k.money ? inrShort(k.value) : k.value, hint: k.hint, href: k.href }))} />}
      {fresh && <StartHere />}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {data.approvals?.length > 0 && (
          <Panel title="Waiting for your approval" className="lg:col-span-2">
            <ul className="divide-y divide-line">
              {data.approvals.map((q: any) => (
                <li key={q.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                  <span><span className="num font-medium">{q.quotationNumber}</span><span className="text-muted">, {q.customer?.name ?? leadLabel(q.lead)}, prepared by {personName(q.preparedBy)}</span></span>
                  <span className="flex items-center gap-3"><span className="num font-medium">{inr(q.totalAmount)}</span><Button size="sm" variant="primary" onClick={() => setQuotation(q.id)}>Review</Button></span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        {data.revenue && <Panel title="Billed and collected, last 6 months"><PairBars data={data.revenue} /></Panel>}
        {data.tasks && (
          <Panel title="My tasks due today" action={<Link href="/tasks" className="text-[13px] text-accent hover:underline">Task board</Link>}>
            {data.tasks.length ? (
              <ul className="divide-y divide-line">
                {data.tasks.map((t: any) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                    <span className="min-w-0"><span className="block truncate">{t.title}</span><span className="text-xs text-muted">{t.project?.name ?? 'General'}</span></span>
                    <span className="flex shrink-0 items-center gap-2"><Badge tone={t.priority === 'URGENT' ? 'bad' : t.priority === 'HIGH' ? 'warn' : 'mute'}>{human(t.priority)}</Badge><DueTag date={t.dueDate} /></span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">Nothing is due today.</p>}
          </Panel>
        )}
        <Attendance />
        {data.followUps && (
          <Panel title="Follow-ups due" action={<Link href="/leads" className="text-[13px] text-accent hover:underline">All leads</Link>}>
            {data.followUps.length ? (
              <ul className="divide-y divide-line">
                {data.followUps.map((l: any) => <li key={l.id} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0"><span className="min-w-0"><span className="block truncate">{personName(l)}</span><span className="text-xs text-muted">{l.companyName}</span></span><DueTag date={l.nextFollowUpAt} /></li>)}
              </ul>
            ) : <p className="text-sm text-muted">No follow-ups are due in the next two days.</p>}
          </Panel>
        )}
        {data.renewals && (
          <Panel title="Renewals in the next 30 days" action={<Link href="/websites" className="text-[13px] text-accent hover:underline">All renewals</Link>}>
            {data.renewals.length ? (
              <ul className="divide-y divide-line">
                {data.renewals.map((w: any) => <li key={w.id} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0"><span className="min-w-0"><span className="block truncate">{w.name}</span><span className="text-xs text-muted">{human(w.type)}, {w.customer.name}</span></span><ExpiryTag date={w.expiryDate} /></li>)}
              </ul>
            ) : <p className="text-sm text-muted">No domain, hosting plan or certificate expires in the next 30 days.</p>}
          </Panel>
        )}
        {data.team && <Panel title="Tasks completed this month"><HBars rows={data.team.map((t: any) => ({ label: t.name, value: t.done, text: String(t.done) }))} empty="No tasks have been completed this month." /></Panel>}
        <Panel title="Recent activity" className={data.team ? '' : 'lg:col-span-2'}>
          {data.activity.length ? (
            <ul className="divide-y divide-line">
              {data.activity.map((a: any) => <li key={a.id} className="flex items-baseline justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0"><span className="min-w-0 break-words">{a.summary}</span><span className="shrink-0 text-xs text-muted">{a.actor ? personName(a.actor) : 'System'}, {ago(a.occurredAt)}</span></li>)}
            </ul>
          ) : <p className="text-sm text-muted">Activity appears here as your team works.</p>}
        </Panel>
      </div>
      {data.kpis.length === 0 && !data.tasks && <Card className="px-4 py-10 text-center text-sm text-muted">Use the menu to open the areas your role covers.</Card>}
      <QuotationSheet id={quotation} onClose={() => setQuotation(null)} onChanged={reload} />
    </div>
  )
}
