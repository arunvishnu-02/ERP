'use client'
import { Download, Printer } from 'lucide-react'
import { useState } from 'react'
import { HBars, PairBars } from '@/components/misc'
import { exportXlsx, type Column } from '@/components/resource'
import { Button, Empty, Loading, Panel, Select, StatBand, Table, Td, Th } from '@/components/ui'
import { useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { gstOff, human, inr, inrShort, monthLabel } from '@/lib/format'

const col = (header: string, key: string): Column => ({ header, cell: () => null, text: (r) => r[key] })

export default function Reports() {
  const { can, lookups } = useAuth()
  const noGst = gstOff(lookups.organization)
  const [months, setMonths] = useState('6')
  const { data, error } = useApi<any>(`/reports/overview?months=${months}`)
  if (error) return <Empty>{error.message}</Empty>
  if (!data) return <Loading />
  const s = data.summary
  const canExport = can('REPORTS', 'EXPORT')
  const Export = ({ name, columns, rows }: { name: string; columns: Column[]; rows: any[] }) => (canExport && rows.length ? <Button size="sm" className="no-print" onClick={() => exportXlsx(name, columns, rows)}><Download size={14} />Excel</Button> : null)
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[13px] text-muted">Period
          <Select className="w-40" value={months} onChange={(e) => setMonths(e.target.value)}><option value="1">This month</option><option value="3">Last 3 months</option><option value="6">Last 6 months</option><option value="12">Last 12 months</option><option value="24">Last 24 months</option></Select>
        </label>
        <div className="flex-1" />
        <Button onClick={() => window.print()}><Printer size={15} />Print or save as PDF</Button>
      </div>
      <StatBand items={[
        { label: 'New leads', value: s.leads, hint: `${s.converted} won, ${s.lost} lost` }, { label: 'Conversion', value: `${s.conversionRate}%`, hint: 'of leads that were decided' },
        { label: 'Deals won', value: inrShort(s.wonValue), hint: 'all time' }, { label: 'Open pipeline', value: inrShort(s.openPipeline), hint: 'deals still open' },
        { label: 'Billed', value: inrShort(s.billed), hint: noGst ? 'invoices raised' : 'invoices with GST' }, { label: 'Collected', value: inrShort(s.collected), tone: 'good', hint: s.billed ? `${Math.round((s.collected / s.billed) * 100)}% of billed` : undefined },
      ]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Revenue by month" action={<Export name="revenue-by-month" columns={[col('Month', 'month'), col('Billed', 'billed'), col('Collected', 'collected')]} rows={data.monthly} />}>
          {data.monthly.some((m: any) => m.billed || m.collected) ? <PairBars data={data.monthly} /> : <p className="py-3 text-sm text-muted">No invoices or payments in this period.</p>}
        </Panel>
        <Panel title="Leads by source" action={<Export name="leads-by-source" columns={[col('Source', 'name'), col('Leads', 'leads'), col('Won', 'won')]} rows={data.leadsBySource} />}>
          <HBars rows={data.leadsBySource.map((x: any) => ({ label: x.name, value: x.leads, text: `${x.leads}, ${x.won} won` }))} empty="No leads in this period." />
        </Panel>
        <Panel title="Leads by stage"><HBars rows={data.leadsByStage.map((x: any) => ({ label: x.name, value: x.leads }))} empty="No leads in this period." /></Panel>
        <Panel title={noGst ? 'Sales by customer' : 'Sales by customer, before GST'} action={<Export name="sales-by-customer" columns={[col('Customer', 'name'), col('Amount', 'amount')]} rows={data.revenueByCustomer} />}>
          <HBars rows={data.revenueByCustomer.map((x: any) => ({ label: x.name, value: x.amount, text: inr(x.amount) }))} empty="No invoices in this period." />
        </Panel>
        <Panel title="Payments by method"><HBars rows={data.paymentsByMethod.map((x: any) => ({ label: human(x.name), value: x.amount, text: inr(x.amount) }))} empty="No payments in this period." /></Panel>
        <Panel title="Projects by status"><HBars rows={data.projectsByStatus.map((x: any) => ({ label: human(x.name), value: x.count }))} empty="No projects yet." /></Panel>
      </div>
      <Panel title="Team performance" flush action={<Export name="team-performance" columns={[col('Person', 'name'), col('Leads', 'leads'), col('Leads won', 'leadsWon'), col('Tasks done', 'tasksDone'), col('Hours logged', 'hours')]} rows={data.team} />}>
        <Table>
          <thead><tr><Th>Person</Th><Th right>Leads</Th><Th right>Leads won</Th><Th right>Tasks done</Th><Th right>Hours logged</Th></tr></thead>
          <tbody>{data.team.map((t: any) => <tr key={t.name}><Td className="font-medium">{t.name}</Td><Td right>{t.leads}</Td><Td right>{t.leadsWon}</Td><Td right>{t.tasksDone}</Td><Td right>{t.hours}</Td></tr>)}</tbody>
        </Table>
      </Panel>
      {!!data.campaigns.length && (
        <Panel title="Campaigns" flush action={<Export name="campaigns" columns={[col('Campaign', 'name'), col('Budget', 'budget'), col('Spent', 'spent'), col('Leads', 'leads')]} rows={data.campaigns} />}>
          <Table>
            <thead><tr><Th>Campaign</Th><Th right>Budget</Th><Th right>Spent</Th><Th right>Leads</Th><Th right>Cost per lead</Th></tr></thead>
            <tbody>{data.campaigns.map((c: any) => <tr key={c.name}><Td className="font-medium">{c.name}</Td><Td right>{inr(c.budget)}</Td><Td right>{inr(c.spent)}</Td><Td right>{c.leads}</Td><Td right>{c.leads ? inr(Math.round(c.spent / c.leads)) : ''}</Td></tr>)}</tbody>
          </Table>
        </Panel>
      )}
      <p className="text-xs text-muted">Period: {monthLabel(data.monthly[0].month)} to {monthLabel(data.monthly[data.monthly.length - 1].month)}. Team and lead figures count records created in the period.</p>
    </div>
  )
}
