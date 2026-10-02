'use client'
import { Download, Paperclip, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { api, downloadFile, useApi } from '@/lib/api'
import { ago, human, personName } from '@/lib/format'
import { Avatar, Button, Card, Empty, Tabs, Textarea } from './ui'

type Tab = 'timeline' | 'notes' | 'comments' | 'files'
const LABEL: Record<Tab, string> = { timeline: 'Timeline', notes: 'Notes', comments: 'Comments', files: 'Files' }

/** Timeline, notes, comments and files for any record. Pass the tabs the record needs. */
export function RecordPanel({ entityType, entityId, tabs = ['timeline', 'notes', 'files'], reloadKey }: { entityType: string; entityId: string; tabs?: Tab[]; reloadKey?: unknown }) {
  const [tab, setTab] = useState<Tab>(tabs[0])
  const q = `entityType=${entityType}&entityId=${entityId}`
  return (
    <Card className="p-4">
      <Tabs value={tab} onChange={(v) => setTab(v as Tab)} options={tabs.map((t) => ({ value: t, label: LABEL[t] }))} />
      <div className="mt-3">
        {tab === 'timeline' && <Timeline key={String(reloadKey)} q={q} />}
        {tab === 'notes' && <Texts kind="notes" q={q} entityType={entityType} entityId={entityId} placeholder="Write a note for the team" />}
        {tab === 'comments' && <Texts kind="comments" q={q} entityType={entityType} entityId={entityId} placeholder="Write a comment" />}
        {tab === 'files' && <Files q={q} entityType={entityType} entityId={entityId} />}
      </div>
    </Card>
  )
}

export function Timeline({ q }: { q: string }) {
  const { data } = useApi<{ items: any[] }>(`/activities?${q}`)
  if (!data) return null
  if (!data.items.length) return <Empty>Nothing has happened on this record yet.</Empty>
  return (
    <ul className="space-y-3">
      {data.items.map((a) => (
        <li key={a.id} className="flex gap-3 text-sm">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
          <div className="min-w-0">
            <div className="break-words">{['CALL', 'MEETING', 'WHATSAPP_SENT', 'EMAIL_SENT'].includes(a.type) ? <b className="font-medium">{human(a.type)}: </b> : null}{a.summary}</div>
            <div className="text-xs text-muted">{a.actor ? personName(a.actor) : 'System'}, {ago(a.occurredAt)}</div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function Texts({ kind, q, entityType, entityId, placeholder }: { kind: 'notes' | 'comments'; q: string; entityType: string; entityId: string; placeholder: string }) {
  const { data, reload } = useApi<{ items: any[] }>(`/${kind}?${q}`)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setBusy(true)
    try { await api(`/${kind}`, { body: { entityType, entityId, body } }); setBody(''); reload() } catch (err) { toast.error((err as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-3">
      <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
        <Button type="submit" variant="primary" loading={busy}>{kind === 'notes' ? 'Add note' : 'Comment'}</Button>
      </form>
      {data?.items.map((n) => (
        <div key={n.id} className="flex gap-2.5 text-sm">
          <Avatar name={personName(n.author)} />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted">{personName(n.author)}, {ago(n.createdAt)}</div>
            <div className="break-words whitespace-pre-wrap">{n.body}</div>
          </div>
          {kind === 'notes' && <Button size="icon" variant="ghost" aria-label="Delete note" onClick={async () => { try { await api(`/notes/${n.id}`, { method: 'DELETE' }); reload() } catch (e) { toast.error((e as Error).message) } }}><Trash2 size={14} /></Button>}
        </div>
      ))}
    </div>
  )
}

function Files({ q, entityType, entityId }: { q: string; entityType: string; entityId: string }) {
  const { data, reload } = useApi<{ items: any[] }>(`/attachments?${q}`)
  const input = useRef<HTMLInputElement>(null)
  async function upload(file?: File) {
    if (!file) return
    const form = new FormData()
    form.append('entityType', entityType)
    form.append('entityId', entityId)
    form.append('file', file)
    try { await api('/attachments', { form }); toast.success('File added'); reload() } catch (e) { toast.error((e as Error).message) }
    if (input.current) input.current.value = ''
  }
  return (
    <div className="space-y-2">
      <input ref={input} type="file" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
      <Button onClick={() => input.current?.click()}><Paperclip size={15} />Add file</Button>
      {data?.items.map((a) => (
        <div key={a.id} className="flex items-center gap-2 text-sm">
          <span className="min-w-0 flex-1 truncate">{a.file.fileName}</span>
          <span className="num text-xs text-muted">{Math.max(1, Math.round(a.file.sizeBytes / 1024))} KB</span>
          <Button size="icon" variant="ghost" aria-label="Download" onClick={() => downloadFile(a.file.id, a.file.fileName).catch((e) => toast.error(e.message))}><Download size={15} /></Button>
          <Button size="icon" variant="ghost" aria-label="Remove file" onClick={async () => { try { await api(`/attachments/${a.id}`, { method: 'DELETE' }); reload() } catch (e) { toast.error((e as Error).message) } }}><Trash2 size={14} /></Button>
        </div>
      ))}
      {data && !data.items.length && <p className="text-sm text-muted">No files yet.</p>}
    </div>
  )
}
