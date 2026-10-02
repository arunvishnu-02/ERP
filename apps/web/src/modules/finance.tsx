'use client'
// Income, expenses, profit and loss, cash flow, vendors and bank accounts.
import { Check, Download, X } from 'lucide-react'
import { useState } from 'react'
import { HBars } from '@/components/misc'
import { exportXlsx, Resource } from '@/components/resource'
import { Button, cn, Loading, Panel, Select, StatBand, Status, Table, Tabs, Td, Th, Two } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { day, fmtDate, human, inr, inrShort, monthLabel, options, todayStr } from '@/lib/format'
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
        {can('FINANCE', 'EXPORT') && <Button onClick={() => exportXlsx('profit-and-loss', [{ header: 'Month', cell: () => null, text: (r) => r.month }, { header: 'Income', cell: () => null, text: (r) => r.income }, { header: 'Expenses', cell: () => null, text: (r) => r.expense }, { header: 'Profit or loss', cell: () => null, text: (r) => r.net }], data.months)}><Download size={15} />Export</Button>}
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
        { name: 'amount', label: 'Amount before GST (₹)', type: 'number', required: true }, { name: 'taxAmount', label: 'GST paid (₹)', type: 'number' }, { name: 'vendorId', label: 'Vendor', type: 'select', options: opt(lookups.vendors) },
        { name: 'projectId', label: 'Project', type: 'select', options: opt(projects), help: 'Optional. Links the cost to a project.' }, { name: 'paymentMethod', label: 'Paid by', type: 'select', options: options(lookups.enums.PaymentMethod) }, { name: 'bankAccountId', label: 'From account', type: 'select', options: opt(lookups.bankAccounts) },
        { name: 'paidById', label: 'Paid by person', type: 'select', options: userOptions(lookups) }, { name: 'isReimbursable', label: 'Reimburse', type: 'checkbox', placeholder: 'The person paid from their own pocket' },
      ]}
      rowActions={(r, ctx) => can('FINANCE', 'APPROVE') && r.status === 'SUBMITTED' && <><Button size="sm" variant="primary" onClick={() => decide(r.id, 'approve', ctx.reload)}><Check size={14} />Approve</Button><Button size="sm" onClick={() => decide(r.id, 'reject', ctx.reload)}><X size={14} />Reject</Button></>}
      columns={[
        { header: 'Expense', cell: (r) => <Two top={r.description} bottom={<><span className="num">{r.expenseNumber}</span>{r.vendor ? `, ${r.vendor.name}` : ''}{r.project ? `, ${r.project.name}` : ''}</>} />, text: (r) => r.description },
        { header: 'Number', exportOnly: true, cell: () => null, text: (r) => r.expenseNumber }, { header: 'Vendor', exportOnly: true, cell: () => null, text: (r) => r.vendor?.name },
        { header: 'Category', cell: (r) => r.category.name, text: (r) => r.category.name }, { header: 'Date', cell: (r) => <span className="whitespace-nowrap text-muted">{fmtDate(r.expenseDate)}</span>, text: (r) => day(r.expenseDate) },
        { header: 'Amount', right: true, cell: (r) => inr(r.amount), text: (r) => r.amount }, { header: 'GST', right: true, cell: (r) => inr(r.taxAmount), text: (r) => r.taxAmount },
        { header: 'Status', cell: (r) => <Status value={r.status} label={r.status === 'SUBMITTED' ? 'Waiting' : undefined} />, text: (r) => human(r.status) },
      ]} />
  )
}

export default function Finance() {
  const { reloadLookups } = useAuth()
  const [tab, setTab] = useState('overview')
  return (
    <div className="space-y-3">
      <Tabs value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'expenses', label: 'Expenses' }, { value: 'vendors', label: 'Vendors' }, { value: 'categories', label: 'Expense categories' }, { value: 'banks', label: 'Bank accounts' }]} />
      {tab === 'overview' && <Overview />}
      {tab === 'expenses' && <Expenses />}
      {tab === 'vendors' && (
        <Resource path="/finance/vendors" module="FINANCE" noun="vendor" search="Search vendor" afterSave={reloadLookups} toForm={(r) => ({ ...r, gstin: r.gstin ?? '', email: r.email ?? '', phone: r.phone ?? '', notes: r.notes ?? '' })}
          fields={[{ name: 'name', label: 'Vendor', required: true }, { name: 'gstin', label: 'GSTIN' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'phone', label: 'Phone' }, { name: 'notes', label: 'Notes', type: 'textarea' }]}
          columns={[{ header: 'Vendor', cell: (r) => <span className="font-medium">{r.name}</span> }, { header: 'GSTIN', cell: (r) => <span className="num">{r.gstin}</span> }, { header: 'Email', cell: (r) => r.email }, { header: 'Phone', cell: (r) => <span className="num">{r.phone}</span> }]} />
      )}
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
