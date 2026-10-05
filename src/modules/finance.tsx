'use client'
// Income, expenses, profit and loss, cash flow, vendors and bank accounts.
import { Check, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { FormDialog, type Field } from '@/components/form'
import { HBars } from '@/components/misc'
import { ExportButton, Resource } from '@/components/resource'
import { Button, cn, Input, Loading, Panel, Select, StatBand, Status, Table, Tabs, Td, Th, Two } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useUrlParam } from '@/lib/url'
import { day, daysFromToday, fmtDate, gstOff, human, inr, inrShort, monthLabel, options, plusDays, todayStr } from '@/lib/format'
import { act, userOptions } from './common'

function Overview() {
  const { can } = useAuth()
  const [months, setMonths] = useState('6')
  const { data } = useApi<{ months: { month: string; income: number; expense: number; net: number }[]; receivables: number; byCategory: { name: string; amount: number }[] }>(`/finance/summary?months=${months}`)
  if (!data) return <Loading />
  const income = data.months.reduce((n, m) => n + m.income, 0)
  const expense = data.months.reduce((n, m) => n + m.expense, 0)
  let running = 0
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[13px] text-muted">Period
          <Select className="w-40" value={months} onChange={(e) => setMonths(e.target.value)}><option value="3">Last 3 months</option><option value="6">Last 6 months</option><option value="12">Last 12 months</option><option value="24">Last 24 months</option></Select>
        </label>
        <div className="flex-1" />
        <ExportButton name="profit-and-loss" module="FINANCE" columns={[{ header: 'Month', cell: () => null, text: (r) => r.month }, { header: 'Income', cell: () => null, text: (r) => r.income }, { header: 'Expenses', cell: () => null, text: (r) => r.expense }, { header: 'Profit or loss', cell: () => null, text: (r) => r.net }]} load={() => data.months} />
      </div>
      <StatBand items={[
        { label: 'Money received', value: inrShort(income), hint: 'payments from customers' }, { label: 'Money spent', value: inrShort(expense), hint: 'approved expenses' },
        { label: income - expense >= 0 ? 'Profit' : 'Loss', value: inrShort(Math.abs(income - expense)), tone: income - expense >= 0 ? 'good' : 'bad', hint: income ? `${Math.round(((income - expense) / income) * 100)}% of income` : undefined },
        { label: 'Still to collect', value: inrShort(data.receivables), hint: 'open invoices', href: '/invoices' },
      ]} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title="Profit and loss, and cash flow by month" flush>
          <Table>
            <thead><tr><Th>Month</Th><Th right>Money in</Th><Th right>Money out</Th><Th right>Profit or loss</Th><Th right>Running total</Th></tr></thead>
            <tbody>{data.months.map((m) => {
              running += m.net
              return <tr key={m.month}><Td>{monthLabel(m.month)}</Td><Td right>{inr(m.income)}</Td><Td right>{inr(m.expense)}</Td><Td right className={cn(m.net < 0 && 'text-bad')}>{inr(m.net)}</Td><Td right className={cn(running < 0 && 'text-bad')}>{inr(running)}</Td></tr>
            })}</tbody>
          </Table>
        </Panel>
        <Panel title="Where the money went"><HBars rows={data.byCategory.map((c) => ({ label: c.name, value: c.amount, text: inr(c.amount) }))} empty="No approved expenses in this period." /></Panel>
      </div>
      <p className="text-xs text-muted">Income is counted when a payment is recorded. An expense is counted when it is approved.</p>
    </div>
  )
}

function Expenses() {
  const { lookups, can } = useAuth()
  const noGst = gstOff(lookups.organization)
  const projects = useApi<{ items: any[] }>(can('PROJECTS') ? '/projects?limit=200' : null).data?.items ?? []
  const opt = (list: any[]) => list.map((x) => ({ value: x.id, label: x.name }))
  const decide = async (id: string, decision: 'approve' | 'reject', reload: () => void) => { if (await act(() => api(`/finance/expenses/${id}/${decision}`, { body: {} }), decision === 'approve' ? 'Expense approved' : 'Expense rejected')) reload() }
  return (
    <Resource path="/finance/expenses" module="FINANCE" noun="expense" search="Search description, number or vendor" exportName="expenses" defaults={{ expenseDate: todayStr(), paymentMethod: 'BANK_TRANSFER', taxAmount: 0 }}
      empty="No expenses yet. Add rent, software, ad spend and other costs. Each one waits for approval before it counts."
      filter={{ param: 'status', options: [{ value: '', label: 'All' }, { value: 'SUBMITTED', label: 'Waiting for approval' }, { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Rejected' }] }}
      toForm={(r) => ({ ...r, expenseDate: day(r.expenseDate), vendorId: r.vendorId ?? '', projectId: r.projectId ?? '', bankAccountId: r.bankAccountId ?? '', paidById: r.paidById ?? '' })}
      fields={[
        { name: 'description', label: 'What was it for', required: true, full: true }, { name: 'categoryId', label: 'Category', type: 'select', options: opt(lookups.expenseCategories), required: true }, { name: 'expenseDate', label: 'Date', type: 'date', required: true },
        { name: 'amount', label: noGst ? 'Amount (₹)' : 'Amount before GST (₹)', type: 'number', required: true }, ...(noGst ? [] : [{ name: 'taxAmount', label: 'GST paid (₹)', type: 'number' } as Field]), { name: 'vendorId', label: 'Vendor', type: 'select', options: opt(lookups.vendors) },
        { name: 'projectId', label: 'Project', type: 'select', options: opt(projects), help: 'Optional. Links the cost to a project.' }, { name: 'paymentMethod', label: 'Paid by', type: 'select', options: options(lookups.enums.PaymentMethod) }, { name: 'bankAccountId', label: 'From account', type: 'select', options: opt(lookups.bankAccounts) },
        { name: 'paidById', label: 'Paid by person', type: 'select', options: userOptions(lookups) }, { name: 'isReimbursable', label: 'Reimburse', type: 'checkbox', placeholder: 'The person paid from their own pocket' },
      ]}
      rowActions={(r, ctx) => can('FINANCE', 'APPROVE') && r.status === 'SUBMITTED' && <><Button size="sm" variant="primary" onClick={() => decide(r.id, 'approve', ctx.reload)}><Check size={14} />Approve</Button><Button size="sm" onClick={() => decide(r.id, 'reject', ctx.reload)}><X size={14} />Reject</Button></>}
      columns={[
        { header: 'Expense', cell: (r) => <Two top={r.description} bottom={<><span className="num">{r.expenseNumber}</span>{r.vendor ? `, ${r.vendor.name}` : ''}{r.project ? `, ${r.project.name}` : ''}</>} />, text: (r) => r.description },
        { header: 'Number', exportOnly: true, cell: () => null, text: (r) => r.expenseNumber }, { header: 'Vendor', exportOnly: true, cell: () => null, text: (r) => r.vendor?.name },
        { header: 'Category', cell: (r) => r.category.name, text: (r) => r.category.name }, { header: 'Date', cell: (r) => <span className="whitespace-nowrap text-muted">{fmtDate(r.expenseDate)}</span>, text: (r) => day(r.expenseDate) },
        { header: 'Amount', right: true, cell: (r) => inr(r.amount), text: (r) => r.amount }, ...(noGst ? [] : [{ header: 'GST', right: true, cell: (r: any) => inr(r.taxAmount), text: (r: any) => r.taxAmount }]),
        { header: 'Status', cell: (r) => <Status value={r.status} label={r.status === 'SUBMITTED' ? 'Waiting' : undefined} />, text: (r) => human(r.status) },
      ]} />
  )
}

function ProjectProfit() {
  const { can } = useAuth()
  const [range, setRange] = useState<{ from?: string; to?: string }>({})
  const q = range.from && range.to ? `?from=${range.from}&to=${range.to}` : ''
  const { data } = useApi<{ from: string; to: string; items: any[] }>(`/finance/project-profit${q}`)
  if (!data) return <Loading />
  const sum = (k: string) => data.items.reduce((n, r) => n + r[k], 0)
  const hours = (m: number) => `${Math.round(m / 6) / 10} h`
  const cols = [
    { header: 'Project', cell: () => null, text: (r: any) => r.name }, { header: 'Customer', cell: () => null, text: (r: any) => r.customer },
    { header: 'Billed', cell: () => null, text: (r: any) => r.billed }, { header: 'Hours', cell: () => null, text: (r: any) => Math.round(r.minutes / 6) / 10 },
    { header: 'Team time cost', cell: () => null, text: (r: any) => r.timeCost }, { header: 'Expenses', cell: () => null, text: (r: any) => r.expenses },
    { header: 'Profit', cell: () => null, text: (r: any) => r.profit }, { header: 'Margin %', cell: () => null, text: (r: any) => r.margin },
  ]
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[13px] text-muted">From<Input type="date" className="w-40" value={range.from ?? data.from} onChange={(e) => setRange({ from: e.target.value, to: range.to ?? data.to })} /></label>
        <label className="flex items-center gap-2 text-[13px] text-muted">To<Input type="date" className="w-40" value={range.to ?? data.to} onChange={(e) => setRange({ from: range.from ?? data.from, to: e.target.value })} /></label>
        <div className="flex-1" />
        <ExportButton name="profit-by-project" module="FINANCE" columns={cols} load={() => data.items} />
      </div>
      <StatBand items={[
        { label: 'Billed', value: inrShort(sum('billed')), hint: 'invoices on projects' }, { label: 'Team time cost', value: inrShort(sum('timeCost')), hint: hours(sum('minutes')) + ' logged' },
        { label: 'Project expenses', value: inrShort(sum('expenses')) }, { label: sum('profit') >= 0 ? 'Profit' : 'Loss', value: inrShort(Math.abs(sum('profit'))), tone: sum('profit') >= 0 ? 'good' : 'bad' },
      ]} />
      <Panel title="Profit by project" flush>
        <div className="overflow-x-auto"><Table>
          <thead><tr><Th>Project</Th><Th right>Billed</Th><Th right>Hours</Th><Th right>Team time cost</Th><Th right>Expenses</Th><Th right>Profit</Th><Th right>Margin</Th></tr></thead>
          <tbody>
            {data.items.map((r) => (
              <tr key={r.id}>
                <Td><Two top={r.name} bottom={[r.customer, r.unpriced ? `${r.unpriced} ${r.unpriced === 1 ? 'person has' : 'people have'} no cost set` : ''].filter(Boolean).join(', ')} /></Td>
                <Td right>{inr(r.billed)}</Td><Td right className="text-muted">{hours(r.minutes)}</Td><Td right>{inr(r.timeCost)}</Td><Td right>{inr(r.expenses)}</Td>
                <Td right className={cn('font-semibold', r.profit < 0 && 'text-bad')}>{inr(r.profit)}</Td><Td right className={cn(r.margin != null && r.margin < 0 && 'text-bad')}>{r.margin == null ? '' : `${r.margin}%`}</Td>
              </tr>
            ))}
            {!data.items.length && <tr><Td colSpan={7} className="py-8 text-center text-muted">No invoices, time or expenses on projects in this period.</Td></tr>}
          </tbody>
        </Table></div>
      </Panel>
      <p className="text-xs text-muted">Billed is the invoice amount before GST, less credit notes, for invoices dated in the period. Team time cost uses each person's hourly cost on the project, or their yearly CTC divided by 2,496 working hours. Expenses count once approved.</p>
    </div>
  )
}

function Vendors() {
  const { lookups, can, reloadLookups } = useAuth()
  const noGst = gstOff(lookups.organization)
  const { data, reload } = useApi<{ items: any[]; bills: any[]; stats: any }>('/finance/vendors-summary')
  const projects = useApi<{ items: any[] }>(can('PROJECTS') ? '/projects?limit=200' : null).data?.items ?? []
  const [vendor, setVendor] = useState<any>(null)
  const [bill, setBill] = useState<any>(null)
  if (!data) return <Loading />
  const st = data.stats
  const edit = can('FINANCE', 'EDIT')
  const opt = (list: any[]) => list.map((x) => ({ value: x.id, label: x.name }))
  const billStatus = (b: any) => (b.status === 'PAID' ? <Status value="PAID" /> : b.status === 'SUBMITTED' ? <Status value="SUBMITTED" label="Waiting for approval" /> : b.overdue ? <Status value="OVERDUE" /> : <Status value="APPROVED" label={daysFromToday(b.dueDate) <= 7 ? 'Due soon' : 'Approved'} />)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {edit && <Button onClick={() => setBill({ expenseDate: todayStr(), dueDate: plusDays(7), taxAmount: 0 })}><Plus size={16} />Add bill</Button>}
        {can('FINANCE', 'CREATE') && <Button variant="primary" onClick={() => setVendor({})}><Plus size={16} />Add vendor</Button>}
      </div>
      <StatBand items={[
        { label: 'To pay vendors', value: inrShort(st.toPay), hint: `${st.dueThisWeek} bill${st.dueThisWeek === 1 ? '' : 's'} due this week` },
        { label: 'Paid this month', value: inrShort(st.paidThisMonth), hint: `${st.paidThisMonthCount} bill${st.paidThisMonthCount === 1 ? '' : 's'}` },
        { label: 'Active vendors', value: st.activeVendors, hint: 'this financial year' },
        { label: 'Overdue bills', value: st.overdue, tone: st.overdue ? 'bad' : undefined, hint: st.overdue ? inr(st.overdueAmount) : 'none' },
      ]} />
      <Panel title="All vendors" flush>
        <div className="overflow-x-auto"><Table>
          <thead><tr><Th>Vendor</Th><Th>Contact</Th><Th right>Bills</Th><Th right>Paid this year</Th><Th right>To pay</Th></tr></thead>
          <tbody>
            {data.items.map((v) => (
              <tr key={v.id} className={cn(edit && 'cursor-pointer hover:bg-surface-2')} onClick={() => edit && setVendor(v)}>
                <Td><Two top={v.name} bottom={v.gstin} /></Td><Td className="text-muted">{[v.phone, v.email].filter(Boolean).join(', ')}</Td>
                <Td right>{v.bills}</Td><Td right>{inr(v.paidThisYear)}</Td><Td right className={cn('font-semibold', !v.toPay && 'font-normal text-muted')}>{inr(v.toPay)}</Td>
              </tr>
            ))}
            {!data.items.length && <tr><Td colSpan={5} className="py-8 text-center text-muted">No vendors yet. Add the people and companies you buy from: hosting, freelancers, printers, ad platforms.</Td></tr>}
          </tbody>
        </Table></div>
      </Panel>
      <Panel title="Purchase bills" flush>
        <div className="overflow-x-auto"><Table>
          <thead><tr><Th>Bill</Th><Th>Vendor</Th><Th>For project</Th><Th>Due</Th><Th right>Amount</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>
            {data.bills.map((b) => (
              <tr key={b.id}>
                <Td><Two top={<span className="num">{b.billNumber || b.expenseNumber}</span>} bottom={b.description} /></Td><Td>{b.vendor?.name}</Td><Td className="text-muted">{b.project?.name}</Td>
                <Td className={cn('whitespace-nowrap', b.overdue && 'text-bad')}>{fmtDate(b.dueDate)}</Td><Td right>{inr(b.total)}</Td><Td>{billStatus(b)}</Td>
                <Td right>{can('FINANCE', 'APPROVE') && b.status === 'APPROVED' && <Button size="sm" onClick={() => act(() => api(`/finance/expenses/${b.id}/paid`, { method: 'POST' }), 'Marked as paid').then(reload)}>Mark paid</Button>}</Td>
              </tr>
            ))}
            {!data.bills.length && <tr><Td colSpan={7} className="py-8 text-center text-muted">No bills yet. Add a bill with a due date and it shows here until it is paid.</Td></tr>}
          </tbody>
        </Table></div>
      </Panel>
      <p className="text-xs text-muted">A bill is an expense with a due date. It waits for approval like any expense, then shows as to pay until you mark it paid. Link each bill to a project and Profit by project shows what each client really costs.</p>
      <FormDialog open={!!vendor} onClose={() => setVendor(null)} title={vendor?.id ? 'Edit vendor' : 'Add vendor'} submitLabel="Save"
        initial={vendor ? { name: vendor.name ?? '', gstin: vendor.gstin ?? '', email: vendor.email ?? '', phone: vendor.phone ?? '', notes: vendor.notes ?? '' } : {}}
        fields={[{ name: 'name', label: 'Vendor', required: true }, ...(noGst ? [] : [{ name: 'gstin', label: 'GSTIN' } as Field]), { name: 'phone', label: 'Phone' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'notes', label: 'Notes, UPI or bank details', type: 'textarea' }]}
        onSubmit={async (v) => { await api(vendor?.id ? `/finance/vendors/${vendor.id}` : '/finance/vendors', { method: vendor?.id ? 'PATCH' : 'POST', body: v }); toast.success('Vendor saved'); reload(); reloadLookups() }} />
      <FormDialog open={!!bill} onClose={() => setBill(null)} title="Add bill" submitLabel="Add bill" initial={bill ?? {}}
        fields={[
          { name: 'vendorId', label: 'Vendor', type: 'select', options: opt(lookups.vendors), required: true }, { name: 'billNumber', label: "Vendor's bill number" },
          { name: 'categoryId', label: 'Category', type: 'select', options: opt(lookups.expenseCategories), required: true }, { name: 'projectId', label: 'For project', type: 'select', options: opt(projects) },
          { name: 'expenseDate', label: 'Bill date', type: 'date', required: true }, { name: 'dueDate', label: 'Due date', type: 'date', required: true },
          { name: 'amount', label: noGst ? 'Amount (₹)' : 'Amount before GST (₹)', type: 'number', required: true }, ...(noGst ? [] : [{ name: 'taxAmount', label: 'GST (₹)', type: 'number' } as Field]),
          { name: 'description', label: 'What is it for', required: true, full: true },
        ]}
        onSubmit={async (v) => { await api('/finance/expenses', { body: v }); toast.success('Bill added. It waits for approval.'); reload() }} />
    </div>
  )
}

export default function Finance() {
  const { reloadLookups } = useAuth()
  const [tab, setTab] = useState('overview')
  useUrlParam('tab', setTab)
  return (
    <div className="space-y-3">
      <Tabs value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'projects', label: 'Profit by project' }, { value: 'expenses', label: 'Expenses' }, { value: 'vendors', label: 'Vendors' }, { value: 'categories', label: 'Expense categories' }, { value: 'banks', label: 'Bank accounts' }]} />
      {tab === 'overview' && <Overview />}
      {tab === 'projects' && <ProjectProfit />}
      {tab === 'expenses' && <Expenses />}
      {tab === 'vendors' && <Vendors />}
      {tab === 'categories' && (
        <Resource path="/finance/expense-categories" module="FINANCE" noun="category" afterSave={reloadLookups} fields={[{ name: 'name', label: 'Category', required: true, full: true }]} columns={[{ header: 'Category', cell: (r) => <span className="font-medium">{r.name}</span> }]} />
      )}
      {tab === 'banks' && (
        <Resource path="/bank-accounts" module="FINANCE" noun="bank account" afterSave={reloadLookups} defaults={{ isActive: true, openingBalance: 0 }}
          toForm={(r) => ({ ...r, bankName: r.bankName ?? '', accountNumberLast4: r.accountNumberLast4 ?? '', ifsc: r.ifsc ?? '', upiId: r.upiId ?? '' })}
          empty="No bank accounts yet. Add the accounts customers pay into, so each payment can be matched to one."
          fields={[{ name: 'name', label: 'Name', required: true, placeholder: 'HDFC current account' }, { name: 'bankName', label: 'Bank' }, { name: 'accountNumberLast4', label: 'Last 4 digits of the account number' }, { name: 'ifsc', label: 'IFSC' }, { name: 'upiId', label: 'UPI ID' }, { name: 'openingBalance', label: 'Opening balance (₹)', type: 'number' }, { name: 'isDefault', label: 'Default', type: 'checkbox', placeholder: 'Use for new payments' }, { name: 'isActive', label: 'In use', type: 'checkbox', placeholder: 'Show in lists' }]}
          columns={[{ header: 'Account', cell: (r) => <Two top={r.name} bottom={r.bankName} /> }, { header: 'Account number', cell: (r) => (r.accountNumberLast4 ? <span className="num">•••• {r.accountNumberLast4}</span> : null) }, { header: 'IFSC', cell: (r) => <span className="num">{r.ifsc}</span> }, { header: 'UPI', cell: (r) => r.upiId }, { header: 'Opening balance', right: true, cell: (r) => inr(r.openingBalance) }, { header: 'Default', cell: (r) => (r.isDefault ? 'Yes' : '') }]} />
      )}
    </div>
  )
}
