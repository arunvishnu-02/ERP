'use client'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Loading, Status, Textarea, cn } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { ago, fmtDate } from '@/lib/format'

export default function PortalTicket() {
  const { id } = useParams<{ id: string }>()
  const { data: t, reload } = useApi<any>(`/portal/tickets/${id}`)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  if (!t) return <Loading />
  async function send() {
    setBusy(true)
    try { await api(`/portal/tickets/${id}/reply`, { body: { body } }); setBody(''); toast.success('Reply sent'); reload() } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <>
      <Link href="/portal/support" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={15} />All tickets</Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2"><div><h1 className="font-display text-2xl font-semibold tracking-tight">{t.subject}</h1><p className="text-sm text-muted"><span className="num">{t.ticketNumber}</span>, opened {fmtDate(t.createdAt)}</p></div><Status value={t.status} label={t.status === 'WAITING_ON_CUSTOMER' ? 'Waiting for you' : undefined} /></div>
      <Card className="p-4">
        <ul className="space-y-3">
          <li className="ml-8 rounded-xl bg-accent-soft px-3 py-2 text-sm"><div className="mb-0.5 text-xs text-muted">You, {fmtDate(t.createdAt)}</div><div className="whitespace-pre-wrap">{t.description}</div></li>
          {t.messages.map((m: any) => (
            <li key={m.id} className={cn('rounded-xl px-3 py-2 text-sm', m.fromClient ? 'ml-8 bg-accent-soft' : 'mr-8 bg-surface-2')}>
              <div className="mb-0.5 text-xs text-muted">{m.fromClient ? m.name : `${m.name}, support team`}, {ago(m.createdAt)}</div>
              <div className="whitespace-pre-wrap">{m.body}</div>
            </li>
          ))}
        </ul>
        {t.status === 'CLOSED' ? <p className="mt-4 border-t border-line pt-3 text-sm text-muted">This ticket is closed. Open a new ticket if you need more help.</p> : (
          <div className="mt-4 space-y-2 border-t border-line pt-3">
            <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply" />
            <div className="flex justify-end"><Button variant="primary" loading={busy} disabled={!body.trim()} onClick={send}>Send reply</Button></div>
          </div>
        )}
      </Card>
    </>
  )
}
