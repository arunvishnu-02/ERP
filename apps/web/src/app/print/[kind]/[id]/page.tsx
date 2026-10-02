'use client'
import { Printer } from 'lucide-react'
import { useParams } from 'next/navigation'
import { DocView } from '@/components/doc'
import { Button, Card } from '@/components/ui'
import { useApi } from '@/lib/api'
import { AuthProvider, useAuth } from '@/lib/auth'
import { amountInWords, fmtDate, human, inr } from '@/lib/format'

/** A receipt for one payment, shown on the print page. */
function Receipt({ p, org }: { p: any; org: any }) {
  return (
    <Card className="space-y-5 p-7">
      <header className="flex flex-wrap justify-between gap-4">
        <div><div className="text-xs font-semibold text-accent">Payment receipt</div><h2 className="font-display text-xl font-semibold">{org.legalName || org.name}</h2>{org.gstin && <div className="text-[13px] text-muted">GSTIN {org.gstin}</div>}</div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-[13px]"><dt className="text-muted">Receipt no.</dt><dd className="num text-right font-medium">{p.receiptNumber}</dd><dt className="text-muted">Date</dt><dd className="text-right">{fmtDate(p.paymentDate)}</dd><dt className="text-muted">Mode</dt><dd className="text-right">{human(p.method)}</dd>{p.referenceNumber && <><dt className="text-muted">Reference</dt><dd className="num text-right">{p.referenceNumber}</dd></>}</dl>
      </header>
      <p className="text-sm">Received with thanks from <b className="font-semibold">{p.customer.name}</b> the sum of <b className="num font-semibold">{inr(p.amount, true)}</b>{p.tdsAmount > 0 ? <> (plus TDS of <span className="num">{inr(p.tdsAmount, true)}</span> deducted)</> : null}.</p>
      <table className="w-full text-sm"><thead><tr className="border-b border-line text-left text-xs text-muted"><th className="py-2 font-medium">Against invoice</th><th className="py-2 text-right font-medium">Received</th><th className="py-2 text-right font-medium">TDS</th></tr></thead>
        <tbody>{p.allocations.map((a: any) => <tr key={a.id} className="border-b border-line/70"><td className="num py-2">{a.invoice.invoiceNumber}</td><td className="num py-2 text-right">{inr(a.amount, true)}</td><td className="num py-2 text-right">{inr(a.tdsAmount, true)}</td></tr>)}</tbody></table>
      <p className="text-[13px] text-muted">{amountInWords(p.amount)}.</p>
    </Card>
  )
}

function PrintBody() {
  const { kind, id } = useParams<{ kind: string; id: string }>()
  const { lookups } = useAuth()
  const path = kind === 'quotation' ? `/quotations/${id}` : kind === 'invoice' ? `/invoices/${id}` : kind === 'receipt' ? `/payments/${id}` : null
  const { data, error } = useApi<any>(path)
  if (error || !path) return <div className="grid min-h-screen place-items-center text-muted">This document could not be opened.</div>
  if (!data) return <div className="grid min-h-screen place-items-center text-muted">Loading…</div>
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      {kind === 'receipt' ? <Receipt p={data} org={lookups.organization} /> : <DocView kind={kind as any} doc={data} org={lookups.organization} />}
      <div className="no-print flex justify-end"><Button variant="primary" onClick={() => window.print()}><Printer size={15} />Print or save as PDF</Button></div>
    </main>
  )
}

export default function PrintPage() {
  return <AuthProvider><PrintBody /></AuthProvider>
}
