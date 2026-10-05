'use client'
import { Printer } from 'lucide-react'
import { useParams } from 'next/navigation'
import { DocView } from '@/components/doc'
import { AppointmentLetter, JoiningForm, PayslipDoc } from '@/components/hr-docs'
import { InfoStrip, Label, Paper, PaperHeader, Signatures } from '@/components/paper'
import { Button } from '@/components/ui'
import { useApi } from '@/lib/api'
import { AuthProvider, useAuth } from '@/lib/auth'
import { amountInWords, fmtDate, human, inr } from '@/lib/format'

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

function PrintBody() {
  const { kind, id } = useParams<{ kind: string; id: string }>()
  const { lookups, can } = useAuth()
  const paths: Record<string, string> = {
    quotation: `/quotations/${id}`, invoice: `/invoices/${id}`, receipt: `/payments/${id}`,
    payslip: can('HR', 'VIEW') ? `/payroll/payslips/${id}` : `/me/payslips/${id}`, appointment: `/payroll/appointment/${id}`, joining: `/payroll/joining/${id}`,
  }
  const path = paths[kind] ?? null
  const { data, error } = useApi<any>(path)
  if (error || !path) return <div className="grid min-h-screen place-items-center text-muted">This document could not be opened.</div>
  if (!data) return <div className="grid min-h-screen place-items-center text-muted">Loading…</div>
  return (
    <main className="print-bare mx-auto max-w-[820px] space-y-4 px-4 py-6">
      {kind === 'receipt' ? <Receipt p={data} org={lookups.organization} />
        : kind === 'payslip' ? <PayslipDoc p={data} org={lookups.organization} />
          : kind === 'appointment' ? <AppointmentLetter d={data} org={lookups.organization} />
          : kind === 'joining' ? <JoiningForm d={data} org={lookups.organization} />
            : <DocView kind={kind as any} doc={data} org={lookups.organization} />}
      <div className="no-print flex justify-end"><Button variant="primary" onClick={() => window.print()}><Printer size={15} />Print or save as PDF</Button></div>
    </main>
  )
}

export default function PrintPage() {
  return <AuthProvider><PrintBody /></AuthProvider>
}
