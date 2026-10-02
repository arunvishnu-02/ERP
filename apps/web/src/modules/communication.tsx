'use client'
import { Mail } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { FormDialog } from '@/components/form'
import { Resource } from '@/components/resource'
import { Badge, Button, Card, Chips, Empty, Loading, Status, Table, Tabs, Td, Th, Two } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { ago, fmtDateTime, human, leadLabel, personName } from '@/lib/format'

function Feed() {
  const { data } = useApi<{ items: any[] }>('/communication/feed?limit=100')
  if (!data) return <Loading />
  if (!data.items.length) return <Card><Empty>Nothing has happened yet. Every lead, quotation, invoice and payment shows up here.</Empty></Card>
  return (
    <Card className="p-4">
      <ul className="space-y-3">
        {data.items.map((a) => (
          <li key={a.id} className="flex gap-3 text-sm">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
            <div className="min-w-0">
              <div className="break-words">{a.summary}</div>
              <div className="text-xs text-muted">{a.actor ? personName(a.actor) : 'System'}, {human(a.entityType)}, {ago(a.occurredAt)}</div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function Messages({ reloadKey }: { reloadKey: number }) {
  const [channel, setChannel] = useState('')
  const { data } = useApi<{ items: any[] }>(`/communication/messages?limit=100${channel ? `&channel=${channel}` : ''}&_=${reloadKey}`)
  return (
    <div className="space-y-3">
      <Chips value={channel} onChange={setChannel} options={[{ value: '', label: 'All' }, { value: 'EMAIL', label: 'Email' }, { value: 'WHATSAPP', label: 'WhatsApp' }]} />
      <Card className="overflow-hidden">
        {!data ? <Loading /> : !data.items.length ? <Empty>No messages yet. Emails and WhatsApp messages sent from leads, quotations and invoices are listed here.</Empty> : (
          <Table>
            <thead><tr><Th>Message</Th><Th>To</Th><Th>About</Th><Th>Sent by</Th><Th>When</Th><Th>Status</Th></tr></thead>
            <tbody>{data.items.map((m) => (
              <tr key={m.id}>
                <Td className="max-w-80"><Two top={m.subject ?? m.body.slice(0, 60)} bottom={m.subject ? m.body.slice(0, 90) : undefined} /></Td>
                <Td><Two top={<span className="num font-normal">{m.toAddress}</span>} bottom={human(m.channel)} /></Td><Td>{m.customer?.name ?? leadLabel(m.lead)}</Td><Td>{personName(m.sentBy) || 'Automatic'}</Td>
                <Td className="whitespace-nowrap text-muted">{fmtDateTime(m.createdAt)}</Td>
                <Td>{m.channel === 'WHATSAPP' ? <Badge tone="info">Opened in WhatsApp</Badge> : <Status value={m.status} />}{m.error && <div className="mt-1 max-w-56 text-xs text-bad">{m.error}</div>}</Td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
      <p className="text-xs text-muted">WhatsApp messages open in WhatsApp on your phone or computer with the text filled in, and you press send. SMS is not connected.</p>
    </div>
  )
}

export default function Communication() {
  const { can } = useAuth()
  const [tab, setTab] = useState('feed')
  const [compose, setCompose] = useState(false)
  const [rk, setRk] = useState(0)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={tab} onChange={setTab} options={[{ value: 'feed', label: 'Activity feed' }, { value: 'messages', label: 'Messages' }, { value: 'templates', label: 'Templates' }]} />
        {can('COMMUNICATION', 'CREATE') && <Button variant="primary" onClick={() => setCompose(true)}><Mail size={15} />Write email</Button>}
      </div>
      {tab === 'feed' && <Feed />}
      {tab === 'messages' && <Messages reloadKey={rk} />}
      {tab === 'templates' && (
        <>
          <Resource path="/communication/templates" module="COMMUNICATION" noun="template" defaults={{ channel: 'EMAIL', isActive: true }} toForm={(r) => ({ ...r, subject: r.subject ?? '' })}
            fields={[{ name: 'name', label: 'Name', required: true }, { name: 'channel', label: 'Used for', type: 'select', options: [{ value: 'EMAIL', label: 'Email' }, { value: 'WHATSAPP', label: 'WhatsApp' }], required: true }, { name: 'key', label: 'Code', required: true, help: 'Keep the code of a built-in template unchanged, or it stops being used.' }, { name: 'subject', label: 'Subject', show: (v) => v.channel === 'EMAIL' }, { name: 'body', label: 'Message', type: 'textarea', required: true }, { name: 'isActive', label: 'In use', type: 'checkbox', placeholder: 'Use this template' }]}
            columns={[{ header: 'Template', cell: (r) => <Two top={r.name} bottom={r.subject} /> }, { header: 'Used for', cell: (r) => human(r.channel) }, { header: 'Message', className: 'max-w-md', cell: (r) => <span className="line-clamp-2 text-[13px] text-muted">{r.body}</span> }, { header: 'In use', cell: (r) => (r.isActive ? 'Yes' : 'No') }]} />
          <p className="text-xs text-muted">Words in double curly brackets, such as {'{{contact}}'}, {'{{number}}'}, {'{{amount}}'} and {'{{link}}'}, are replaced with the real values when a message is written.</p>
        </>
      )}
      <FormDialog open={compose} onClose={() => setCompose(false)} title="Write email" submitLabel="Send email"
        fields={[{ name: 'to', label: 'To', type: 'email', required: true, full: true }, { name: 'subject', label: 'Subject', required: true, full: true }, { name: 'body', label: 'Message', type: 'textarea', required: true }]}
        onSubmit={async (v) => { const r = await api('/communication/email', { body: v }); if (r.sent) toast.success('Email sent'); else toast.error(r.error ?? 'The email could not be sent'); setRk((k) => k + 1); setTab('messages') }} />
    </div>
  )
}
