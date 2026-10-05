'use client'
import { Printer } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { api, useApi } from '@/lib/api'
import { DocView } from './doc'
import { Button } from './ui'

/** The page a customer opens from the link in an email or WhatsApp message. No sign-in needed. */
export function PublicDoc({ kind }: { kind: 'quotation' | 'invoice' }) {
  const { token } = useParams<{ token: string }>()
  const { data, error, reload } = useApi<any>(`/public/${kind}s/${token}`)
  const [busy, setBusy] = useState('')
  const decide = async (d: 'accept' | 'decline') => {
    setBusy(d)
    try { await api(`/public/quotations/${token}/${d}`, { method: 'POST' }); toast.success(d === 'accept' ? 'Quotation accepted. Thank you.' : 'Quotation declined'); reload() } catch (e) { toast.error((e as Error).message) } finally { setBusy('') }
  }
  if (error) return <div className="grid min-h-screen place-items-center px-5 text-center text-muted">This link is not valid any more. Ask the sender for a new one.</div>
  if (!data) return <div className="grid min-h-screen place-items-center text-muted">Loading…</div>
  const open = kind === 'quotation' && ['SENT', 'VIEWED'].includes(data.status)
  return (
    <main className="print-bare mx-auto max-w-[820px] space-y-4 px-4 py-6">
      <DocView kind={kind} doc={data} org={data.organization} />
      <div className="no-print flex flex-wrap justify-end gap-2">
        <Button onClick={() => window.print()}><Printer size={15} />Print or save as PDF</Button>
        {open && <><Button loading={busy === 'decline'} onClick={() => decide('decline')}>Decline</Button><Button variant="primary" loading={busy === 'accept'} onClick={() => decide('accept')}>Accept quotation</Button></>}
      </div>
    </main>
  )
}
