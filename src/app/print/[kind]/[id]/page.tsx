'use client'
import { Printer } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { DocView } from '@/components/doc'
import { AppointmentLetter, ExperienceLetter, InternshipCertificate, JoiningForm, OfferLetter, PayslipDoc, StaffTerms } from '@/components/hr-docs'
import { InfoStrip, Label, Paper, PaperHeader, Signatures } from '@/components/paper'
import { Button, Input } from '@/components/ui'
import { useApi } from '@/lib/api'
import { AuthProvider, useAuth } from '@/lib/auth'
import { amountInWords, fmtDate, human, inr, todayStr } from '@/lib/format'

/** A receipt for one payment, shown on the print page. */
function Receipt({ p, org }: { p: any; org: any }) {
  return (
    <Paper org={org}>
      <PaperHeader org={org} title="RECEIPT" />
      <InfoStrip items={[['Receipt no.', p.receiptNumber], ['Date', fmtDate(p.paymentDate)], ['Mode', human(p.method)], ['Reference', p.referenceNumber]]} />
      <p className="text-[13.5px]">Received with thanks from <b className="font-semibold">{p.customer.name}</b> the sum of <b className="num font-semibold">{inr(p.amount, true)}</b>{p.tdsAmount > 0 ? <> (plus TDS of <span className="num">{inr(p.tdsAmount, true)}</span> deducted)</> : null}.</p>
      <table className="w-full border-separate border-spacing-0 text-[12.5px]">
        <thead><tr className="text-left text-[11px] text-white"><th className="rounded-l-md bg-[var(--doc-navy)] px-3 py-2.5 font-semibold">Against invoice</th><th className="bg-[var(--doc-navy)] px-3 py-2.5 text-right font-semibold">Received</th><th className="rounded-r-md bg-[var(--doc-navy)] px-3 py-2.5 text-right font-semibold">TDS</th></tr></thead>
        <tbody>{p.allocations.map((a: any) => <tr key={a.id}><td className="num border-b border-[var(--doc-line)] px-3 py-2.5">{a.invoice.invoiceNumber}</td><td className="num border-b border-[var(--doc-line)] px-3 py-2.5 text-right">{inr(a.amount, true)}</td><td className="num border-b border-[var(--doc-line)] px-3 py-2.5 text-right">{inr(a.tdsAmount, true)}</td></tr>)}</tbody>
      </table>
      <div className="text-[12px]"><Label>Amount in words</Label><div className="mt-1 font-semibold">{amountInWords(p.amount)}</div></div>
      <Signatures org={org} />
    </Paper>
  )
}

const LETTERS = ['offer', 'internship', 'experience', 'terms']
const plus = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

/** Dates and wording for letters, changed above the page before printing. Nothing here is saved. */
function LetterOptions({ kind, opts, set }: { kind: string; opts: Record<string, string>; set: (o: Record<string, string>) => void }) {
  const fields: [string, string, 'date' | 'text'][] = [['date', kind === 'terms' ? 'Applies from' : 'Letter date', 'date']]
  if (kind === 'offer') fields.push(['joining', 'Joining date', 'date'], ['replyBy', 'Reply by', 'date'])
  if (kind === 'internship') fields.push(['from', 'From', 'date'], ['to', 'To', 'date'], ['work', 'What they did (optional)', 'text'])
  if (kind === 'experience') fields.push(['lastDay', 'Last working day', 'date'])
  return (
    <div className="no-print flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-3">
      {fields.map(([k, label, type]) => (
        <label key={k} className={`flex flex-col gap-1 text-[12px] text-muted ${type === 'text' ? 'min-w-64 flex-1' : ''}`}>{label}
          <Input type={type} value={opts[k] ?? ''} placeholder={type === 'text' ? 'worked on websites and social media campaigns for clients' : undefined} onChange={(e) => set({ ...opts, [k]: e.target.value })} />
        </label>
      ))}
    </div>
  )
}

function PrintBody() {
  const { kind, id } = useParams<{ kind: string; id: string }>()
  const { lookups, can } = useAuth()
  const paths: Record<string, string> = {
    quotation: `/quotations/${id}`, invoice: `/invoices/${id}`, receipt: `/payments/${id}`,
    payslip: can('HR', 'VIEW') ? `/payroll/payslips/${id}` : `/me/payslips/${id}`, appointment: `/payroll/appointment/${id}`, offer: `/payroll/appointment/${id}`,
    joining: `/payroll/joining/${id}`, internship: `/payroll/joining/${id}`, experience: `/payroll/joining/${id}`, terms: '/payroll/joining/new',
  }
  const path = paths[kind] ?? null
  const { data, error } = useApi<any>(path)
  const [opts, setOpts] = useState<Record<string, string> | null>(null)
  useEffect(() => {
    const e = data?.employee
    if (!data || opts || !LETTERS.includes(kind)) return
    const t = todayStr()
    const doj = e?.dateOfJoining?.slice(0, 10) ?? t
    setOpts({ date: t, joining: doj > t ? doj : plus(t, 7), replyBy: plus(t, 7), from: doj, to: e?.exitDate?.slice(0, 10) ?? t, lastDay: e?.exitDate?.slice(0, 10) ?? t, work: '' })
  }, [data, opts, kind])
  if (error || !path) return <div className="grid min-h-screen place-items-center text-muted">This document could not be opened.</div>
  if (!data || (LETTERS.includes(kind) && !opts)) return <div className="grid min-h-screen place-items-center text-muted">Loading…</div>
  const org = lookups.organization
  const o = opts as any
  return (
    <main className="print-bare mx-auto max-w-[820px] space-y-4 px-4 py-6">
      {LETTERS.includes(kind) && <LetterOptions kind={kind} opts={o} set={setOpts} />}
      {kind === 'receipt' ? <Receipt p={data} org={org} />
        : kind === 'payslip' ? <PayslipDoc p={data} org={org} />
          : kind === 'appointment' ? <AppointmentLetter d={data} org={org} />
            : kind === 'joining' ? <JoiningForm d={data} org={org} />
              : kind === 'offer' ? <OfferLetter d={data} org={org} opts={o} />
                : kind === 'internship' ? <InternshipCertificate d={data} org={org} opts={o} />
                  : kind === 'experience' ? <ExperienceLetter d={data} org={org} opts={o} />
                    : kind === 'terms' ? <StaffTerms d={data} org={org} opts={o} />
                      : <DocView kind={kind as any} doc={data} org={org} />}
      <div className="no-print flex justify-end"><Button variant="primary" onClick={() => window.print()}><Printer size={15} />Print or save as PDF</Button></div>
    </main>
  )
}

export default function PrintPage() {
  return <AuthProvider><PrintBody /></AuthProvider>
}
