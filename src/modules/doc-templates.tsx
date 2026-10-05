'use client'
// Settings > Documents: every document the app prints, with a sample of each to open.
import { ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { Badge, Button, Card, Select } from '@/components/ui'
import { useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'

type Tpl = { key: string; name: string; title: string; where: string; needs: 'invoice' | 'quotation' | 'payslip' | 'employee' | 'none'; lines: number }
const TEMPLATES: Tpl[] = [
  { key: 'invoice', name: 'Invoice', title: 'INVOICE', where: 'Invoices, open one, then Print', needs: 'invoice', lines: 5 },
  { key: 'quotation', name: 'Quotation', title: 'QUOTATION', where: 'Quotations, open one, then Print', needs: 'quotation', lines: 5 },
  { key: 'payslip', name: 'Payslip', title: 'PAYSLIP', where: 'HR, Payroll, then the file icon on a person', needs: 'payslip', lines: 4 },
  { key: 'appointment', name: 'Appointment letter', title: 'APPOINTMENT LETTER', where: 'HR, Employees, letter icon on a person', needs: 'employee', lines: 7 },
  { key: 'offer', name: 'Offer letter', title: 'OFFER LETTER', where: 'Pick a person below, or add the candidate under HR, Employees first', needs: 'employee', lines: 6 },
  { key: 'internship', name: 'Internship certificate', title: 'INTERNSHIP CERTIFICATE', where: 'Pick the intern below. Dates can be changed before printing', needs: 'employee', lines: 3 },
  { key: 'experience', name: 'Experience letter', title: 'EXPERIENCE LETTER', where: 'Pick the person below. Uses their last working day', needs: 'employee', lines: 4 },
  { key: 'joining', name: 'Joining form', title: 'JOINING FORM', where: 'HR, Employees, Blank joining form', needs: 'none', lines: 8 },
  { key: 'terms', name: 'Terms and conditions', title: 'TERMS AND CONDITIONS', where: 'Edit the rules in HR, Payroll, Payroll settings', needs: 'none', lines: 8 },
  { key: 'receipt', name: 'Payment receipt', title: 'RECEIPT', where: 'Payments, then the printer icon on a payment', needs: 'none', lines: 3 },
]

/** A small drawing of the house-style page, so each card looks like the document it makes. */
function Thumb({ t, logo }: { t: Tpl; logo?: string }) {
  return (
    <div className="relative mx-auto h-[150px] w-[112px] overflow-hidden rounded-sm bg-white shadow-sm ring-1 ring-black/5">
      <span className="absolute inset-y-0 left-0 w-1.5 bg-[#08043a]" /><span className="absolute top-12 left-0 h-8 w-1.5 bg-[#02a6dc]" />
      <div className="flex items-start justify-between gap-1 pt-2.5 pr-2 pl-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo ? <img src={logo} alt="" className="h-2.5 max-w-[40px] object-contain object-left" /> : <span className="h-2 w-8 rounded-sm bg-[#08043a]/70" />}
        <span className="max-w-[56px] text-right text-[5px] leading-tight font-bold text-[#08043a]">{t.title}</span>
      </div>
      <div className="mt-2 mr-2 ml-4 h-3 rounded-sm bg-[#f3f6fb]" />
      <div className="mt-2 mr-2 ml-4 space-y-1">{Array.from({ length: t.lines }, (_, i) => <div key={i} className="h-[3px] rounded-full bg-[#e3e6ee]" style={{ width: `${90 - ((i * 17) % 35)}%` }} />)}</div>
      {['invoice', 'quotation', 'payslip'].includes(t.key) && <div className="mt-2 mr-2 ml-4 h-2 rounded-sm bg-[#08043a]" />}
      <div className="absolute right-2 bottom-2 left-4 flex h-[3px] overflow-hidden rounded-full"><span className="w-1/4 bg-[#08043a]" /><span className="w-1/6 bg-[#02a6dc]" /><span className="flex-1 bg-[#bfe9f7]" /></div>
    </div>
  )
}

export default function DocTemplates() {
  const { lookups, can } = useAuth()
  const people = lookups.employees as { id: string; name: string; status: string }[]
  const [person, setPerson] = useState('')
  const hr = can('HR', 'VIEW')
  const inv = useApi<{ items: any[]; total: number }>(can('INVOICES', 'VIEW') ? '/invoices?limit=1' : null)
  const quo = useApi<{ items: any[]; total: number }>(can('QUOTATIONS', 'VIEW') ? '/quotations?limit=1' : null)
  const pay = useApi<{ items: any[] }>(hr ? '/payroll' : null)
  const run = useApi<any>(pay.data?.items[0] ? `/payroll/${pay.data.items[0].id}` : null)
  const sample = (t: Tpl): string | null => {
    if (t.needs === 'invoice') return inv.data?.items[0] ? `/print/invoice/${inv.data.items[0].id}` : null
    if (t.needs === 'quotation') return quo.data?.items[0] ? `/print/quotation/${quo.data.items[0].id}` : null
    if (t.needs === 'payslip') return run.data?.payslips?.[0] ? `/print/payslip/${run.data.payslips[0].id}` : null
    if (t.needs === 'employee') return hr && person ? `/print/${t.key}/${person}` : null
    if (t.key === 'joining') return hr ? '/print/joining/new' : null
    if (t.key === 'terms') return hr ? '/print/terms/new' : null
    return null
  }
  const used = (t: Tpl) => (t.key === 'invoice' ? inv.data?.total : t.key === 'quotation' ? quo.data?.total : undefined)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">Every document the app makes uses one of these. Only the details change each time. They all print on A4, and the Print button saves them as PDF.</p>
        {hr && (
          <label className="flex items-center gap-2 text-[13px] text-muted">Show letters for
            <Select className="w-56" value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="">Choose a person…</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.status === 'EXITED' ? ' (left)' : ''}</option>)}
            </Select>
          </label>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {TEMPLATES.map((t) => {
          const href = sample(t)
          const n = used(t)
          return (
            <Card key={t.key} className="flex flex-col p-3">
              <div className="rounded-lg bg-surface-2 py-3"><Thumb t={t} logo={lookups.organization?.settings?.logo} /></div>
              <div className="mt-3 flex items-center justify-between gap-2"><span className="text-[13.5px] font-semibold">{t.name}</span>{n ? <span className="num text-[11.5px] text-muted">{n} made</span> : null}</div>
              <div className="mt-1"><Badge tone="good">Ready</Badge></div>
              <p className="mt-2 flex-1 text-[12px] leading-snug text-muted">{t.where}</p>
              <Button size="sm" className="mt-3" disabled={!href} onClick={() => href && window.open(href, '_blank')}><ExternalLink size={14} />{href ? 'Open' : t.needs === 'employee' ? 'Choose a person first' : 'No sample yet'}</Button>
            </Card>
          )
        })}
      </div>
      <p className="rounded-lg bg-accent-soft px-4 py-2.5 text-[12.5px]">Company name, logo, address, bank details and signatory come from Settings, Company. A change there updates every document.</p>
    </div>
  )
}
