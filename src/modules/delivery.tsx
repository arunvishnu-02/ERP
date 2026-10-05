'use client'
// Websites, support tickets and documents.
import { Copy, Download, Eye, EyeOff, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog, FormDialog, type Field } from '@/components/form'
import { RecordPanel } from '@/components/record'
import { Resource } from '@/components/resource'
import { Badge, Button, Card, Chips, Empty, KV, Select, Sheet, Status, Table, Tabs, Td, Textarea, Th, Two } from '@/components/ui'
import { api, downloadFile, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useUrlParam } from '@/lib/url'
import { ago, day, fmtDate, gstOff, human, inr, options, personName, plusDays } from '@/lib/format'
import { act, ExpiryTag, Person, useCustomerOptions, userOptions } from './common'

function Credentials() {
  const { can, lookups } = useAuth()
  const customers = useCustomerOptions()
  const { data, reload } = useApi<{ items: any[] }>('/credentials')
  const [shown, setShown] = useState<Record<string, string>>({})
  const [form, setForm] = useState<{ row?: any } | null>(null)
  const reveal = async (id: string) => {
    if (shown[id]) return setShown(({ [id]: _, ...rest }) => rest)
    try { const r = await api(`/credentials/${id}/reveal`, { method: 'POST' }); setShown((s) => ({ ...s, [id]: r.secret })); reload() } catch (e) { toast.error((e as Error).message) }
  }
  const fields: Field[] = [
    { name: 'label', label: 'Name', required: true, full: true, placeholder: 'Acme WordPress admin' }, { name: 'type', label: 'Type', type: 'select', options: options(lookups.enums.CredentialType), required: true },
    { name: 'customerId', label: 'Customer', type: 'select', options: customers }, { name: 'url', label: 'Login address', full: true }, { name: 'username', label: 'Username' },
    { name: 'secret', label: form?.row ? 'New password (leave empty to keep)' : 'Password', type: 'password', required: !form?.row }, { name: 'notes', label: 'Notes', type: 'textarea' },
  ]
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">Passwords are stored encrypted. Every time one is revealed, it is recorded with the person and time.</p>
        {can('WEBSITES', 'CREATE') && <Button variant="primary" onClick={() => setForm({})}><Plus size={16} />Add credential</Button>}
      </div>
      <Card className="overflow-hidden">
        {!data?.items.length ? <Empty>No credentials stored yet.</Empty> : (
          <Table>
            <thead><tr><Th>Credential</Th><Th>Customer</Th><Th>Username</Th><Th>Password</Th><Th>Viewed</Th><Th /></tr></thead>
            <tbody>{data.items.map((c) => (
              <tr key={c.id}>
                <Td><Two top={c.label} bottom={[human(c.type), c.url].filter(Boolean).join(', ')} /></Td><Td>{c.customer?.name}</Td><Td className="num">{c.username}</Td>
                <Td className="num">{shown[c.id] ?? '••••••••••'}</Td>
                <Td><Two top={<span className="num font-normal">{c._count.accessLogs} times</span>} bottom={c.accessLogs[0] ? `last by ${personName(c.accessLogs[0].user)}, ${ago(c.accessLogs[0].accessedAt)}` : 'never'} /></Td>
                <Td><div className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" aria-label={shown[c.id] ? 'Hide password' : 'Reveal password'} onClick={() => reveal(c.id)}>{shown[c.id] ? <EyeOff size={15} /> : <Eye size={15} />}</Button>
                  {shown[c.id] && <Button size="icon" variant="ghost" aria-label="Copy password" onClick={() => navigator.clipboard?.writeText(shown[c.id]).then(() => toast.success('Password copied'))}><Copy size={15} /></Button>}
                  {can('WEBSITES', 'EDIT') && <Button size="icon" variant="ghost" aria-label="Edit credential" onClick={() => setForm({ row: c })}><Pencil size={15} /></Button>}
                  {can('WEBSITES', 'DELETE') && <Button size="icon" variant="ghost" aria-label="Delete credential" onClick={() => act(() => api(`/credentials/${c.id}`, { method: 'DELETE' }), 'Credential deleted').then(reload)}><Trash2 size={15} /></Button>}
                </div></Td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
      <FormDialog open={!!form} onClose={() => setForm(null)} title={form?.row ? 'Edit credential' : 'Add credential'} fields={fields} submitLabel="Save" initial={form?.row ? { ...form.row, customerId: form.row.customerId ?? '', url: form.row.url ?? '', username: form.row.username ?? '', notes: form.row.notes ?? '', secret: '' } : { type: 'CMS_ADMIN' }}
        onSubmit={async (v) => { if (form?.row) await api(`/credentials/${form.row.id}`, { method: 'PATCH', body: v }); else await api('/credentials', { body: v }); toast.success('Credential saved'); reload() }} />
    </div>
  )
}

export function Websites() {
  const { lookups, can } = useAuth()
  const customers = useCustomerOptions()
  const sites = useApi<{ items: any[] }>('/websites?limit=200').data?.items ?? []
  const [tab, setTab] = useState('renewals')
  const [renew, setRenew] = useState<{ row: any; reload: () => void } | null>(null)
  return (
    <div className="space-y-3">
      <Tabs value={tab} onChange={setTab} options={[{ value: 'renewals', label: 'Domains, hosting and SSL' }, { value: 'websites', label: 'Websites' }, { value: 'credentials', label: 'Credentials' }]} />
      {tab === 'renewals' && <>
        <Resource path="/web-assets" module="WEBSITES" noun="renewal" search="Search name, provider or customer" exportName="renewals" defaults={{ type: 'DOMAIN', expiryDate: plusDays(365), ownedBy: 'AGENCY' }}
          toForm={(r) => ({ ...r, expiryDate: day(r.expiryDate), purchaseDate: day(r.purchaseDate), websiteId: r.websiteId ?? '', provider: r.provider ?? '', renewalCost: r.renewalCost ?? '', billingAmount: r.billingAmount ?? '' })}
          empty="Nothing to renew yet. Add each domain, hosting plan and SSL certificate with its expiry date to get reminders."
          fields={[{ name: 'type', label: 'Type', type: 'select', options: options(lookups.enums.WebAssetType), required: true }, { name: 'name', label: 'Name', required: true, placeholder: 'example.com' }, { name: 'customerId', label: 'Customer', type: 'select', options: customers, required: true }, { name: 'websiteId', label: 'Website', type: 'select', options: sites.map((s) => ({ value: s.id, label: s.name })) }, { name: 'provider', label: 'Provider' }, { name: 'ownedBy', label: 'Account held by', type: 'select', options: options(lookups.enums.AssetOwner) }, { name: 'purchaseDate', label: 'Bought on', type: 'date' }, { name: 'expiryDate', label: 'Expires on', type: 'date', required: true }, { name: 'renewalCost', label: 'Our cost per year (₹)', type: 'number' }, { name: 'billingAmount', label: 'Billed to customer per year (₹)', type: 'number', help: 'Used for the renewal invoice' }, { name: 'autoRenew', label: 'Auto-renew', type: 'checkbox', placeholder: 'The provider renews it automatically' }]}
          rowActions={(r, ctx) => can('WEBSITES', 'EDIT') && <Button size="sm" onClick={() => setRenew({ row: r, reload: ctx.reload })}>Renew</Button>}
          columns={[
            { header: 'Renewal', cell: (r) => <Two top={r.name} bottom={[human(r.type), r.provider].filter(Boolean).join(', ')} />, text: (r) => r.name }, { header: 'Type', exportOnly: true, cell: () => null, text: (r) => human(r.type) },
            { header: 'Customer', cell: (r) => r.customer.name, text: (r) => r.customer.name }, { header: 'Expires', cell: (r) => <ExpiryTag date={r.expiryDate} />, text: (r) => day(r.expiryDate) },
            { header: 'Our cost', right: true, cell: (r) => inr(r.renewalCost), text: (r) => r.renewalCost }, { header: 'Billed', right: true, cell: (r) => inr(r.billingAmount), text: (r) => r.billingAmount },
          ]} />
        <p className="text-xs text-muted">Reminders go out 30, 15, 7 and 1 days before expiry.</p>
        <ConfirmDialog open={!!renew} onClose={() => setRenew(null)} title={`Renew ${renew?.row.name} for one year?`} confirmLabel="Renew"
          onConfirm={async () => { const r = await api(`/web-assets/${renew!.row.id}/renew`, { body: {} }); toast.success(r.invoice ? 'Renewed. A draft invoice was created.' : 'Renewed'); renew!.reload() }}>
          The expiry date moves forward one year.{renew?.row.billingAmount ? ` A draft invoice for ${inr(renew.row.billingAmount)}${gstOff(lookups.organization) ? '' : ' plus GST'} is created for ${renew.row.customer.name}.` : ''} Renew with the provider separately.
        </ConfirmDialog>
      </>}
      {tab === 'websites' && (
        <Resource path="/websites" module="WEBSITES" noun="website" search="Search website or customer" defaults={{ status: 'IN_DEVELOPMENT' }} toForm={(r) => ({ ...r, platform: r.platform ?? '', notes: r.notes ?? '' })}
          fields={[{ name: 'name', label: 'Website', required: true }, { name: 'url', label: 'Address', required: true, placeholder: 'https://example.com' }, { name: 'customerId', label: 'Customer', type: 'select', options: customers, required: true }, { name: 'platform', label: 'Built with', placeholder: 'WordPress, Shopify, Next.js' }, { name: 'status', label: 'Status', type: 'select', options: options(lookups.enums.WebsiteStatus), required: true }, { name: 'notes', label: 'Notes', type: 'textarea' }]}
          columns={[{ header: 'Website', cell: (r) => <Two top={r.name} bottom={<a href={r.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.url}</a>} /> }, { header: 'Customer', cell: (r) => r.customer.name }, { header: 'Built with', cell: (r) => r.platform }, { header: 'Status', cell: (r) => <Status value={r.status} /> }]} />
      )}
      {tab === 'credentials' && <Credentials />}
    </div>
  )
}

/** Replies to the customer (sent by email) and team notes on a ticket, oldest first. */
function Conversation({ ticket, onChanged }: { ticket: any; onChanged: (t?: any) => void }) {
  const { can } = useAuth()
  const { data, reload } = useApi<{ items: any[]; replyTo: string | null }>(`/tickets/${ticket.id}/conversation`)
  const [mode, setMode] = useState('reply')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const internal = mode === 'note'
  async function send() {
    if (!body.trim()) return
    setBusy(true)
    try {
      const r = await api<any>(`/tickets/${ticket.id}/reply`, { body: { body, internal, status: status || undefined } })
      if (internal) toast.success('Note added')
      else if (r.mail?.sent) toast.success(`Reply sent to ${data?.replyTo}`)
      else toast.warning(`Reply saved, but the email was not sent. ${r.mail?.error ?? ''}`)
      setBody(''); setStatus(''); reload(); onChanged()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }
  return (
    <Card className="p-4">
      <h3 className="mb-3 font-display text-[15px] font-semibold">Conversation</h3>
      <ul className="space-y-2.5">
        <li className="rounded-xl bg-surface-2 px-3 py-2 text-sm"><div className="mb-0.5 text-xs text-muted">{ticket.customer.name}, {fmtDate(ticket.createdAt)}</div><div className="whitespace-pre-wrap">{ticket.description}</div></li>
        {data?.items.map((c) => (
          <li key={c.id} className={c.isInternal ? 'rounded-xl border border-dashed border-line px-3 py-2 text-sm' : c.contact ? 'rounded-xl bg-surface-2 px-3 py-2 text-sm' : 'ml-6 rounded-xl bg-accent-soft px-3 py-2 text-sm'}>
            <div className="mb-0.5 text-xs text-muted">{c.contact ? personName(c.contact) : personName(c.author)}, {ago(c.createdAt)}, {c.isInternal ? 'team note' : c.contact ? 'from the client portal' : 'sent to customer'}</div>
            <div className="whitespace-pre-wrap">{c.body}</div>
          </li>
        ))}
      </ul>
      {can('TICKETS', 'EDIT') && (
        <div className="mt-4 space-y-2 border-t border-line pt-3">
          <Tabs value={mode} onChange={setMode} options={[{ value: 'reply', label: 'Reply to customer' }, { value: 'note', label: 'Team note' }]} />
          {!internal && <p className="text-xs text-muted">{data?.replyTo ? `Goes by email to ${data.replyTo}.` : 'This customer has no email address yet. Add one to send replies.'}</p>}
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={internal ? 'Only your team sees this' : 'Write your reply'} rows={4} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Select className="h-9 w-auto text-[13px]" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status after sending">
              <option value="">Keep status</option>
              {['IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED'].map((v) => <option key={v} value={v}>Set to {human(v).toLowerCase()}</option>)}
            </Select>
            <Button variant="primary" disabled={busy || !body.trim() || (!internal && !data?.replyTo)} onClick={send}>{internal ? 'Add note' : 'Send reply'}</Button>
          </div>
        </div>
      )}
    </Card>
  )
}

export function Tickets() {
  const { lookups, can } = useAuth()
  const customers = useCustomerOptions()
  const [openRow, setOpenRow] = useState<any>(null)
  useUrlParam('open', (id) => { api(`/tickets/${id}`).then(setOpenRow).catch(() => {}) })
  const [rk, setRk] = useState(0)
  const devs = userOptions(lookups)
  return (
    <>
      <Resource path="/tickets" module="TICKETS" noun="ticket" search="Search subject, number or customer" exportName="tickets" reloadKey={rk} onOpen={setOpenRow} defaults={{ priority: 'MEDIUM', status: 'OPEN', channel: 'INTERNAL' }}
        toForm={(r) => ({ ...r, assigneeId: r.assigneeId ?? '', category: r.category ?? '', resolutionNotes: r.resolutionNotes ?? '' })}
        filter={{ param: 'status', options: [{ value: '', label: 'All' }, ...options(lookups.enums.TicketStatus)] }}
        fields={[{ name: 'subject', label: 'Subject', required: true, full: true }, { name: 'customerId', label: 'Customer', type: 'select', options: customers, required: true }, { name: 'assigneeId', label: 'Assign to', type: 'select', options: devs }, { name: 'priority', label: 'Priority', type: 'select', options: options(lookups.enums.Priority), required: true }, { name: 'channel', label: 'Came in by', type: 'select', options: options(lookups.enums.TicketChannel) }, { name: 'status', label: 'Status', type: 'select', options: options(lookups.enums.TicketStatus), required: true }, { name: 'category', label: 'Category' }, { name: 'description', label: 'What is the problem', type: 'textarea', required: true }, { name: 'resolutionNotes', label: 'Resolution notes', type: 'textarea' }]}
        columns={[
          { header: 'Ticket', cell: (r) => <Two top={r.subject} bottom={<><span className="num">{r.ticketNumber}</span>, {r.customer.name}</>} />, text: (r) => r.subject }, { header: 'Customer', exportOnly: true, cell: () => null, text: (r) => r.customer.name },
          { header: 'Priority', cell: (r) => <Badge tone={r.priority === 'URGENT' ? 'bad' : r.priority === 'HIGH' ? 'warn' : 'mute'}>{human(r.priority)}</Badge>, text: (r) => human(r.priority) }, { header: 'Assigned to', cell: (r) => <Person user={r.assignee} />, text: (r) => personName(r.assignee) },
          { header: 'Opened', cell: (r) => <span className="text-muted">{fmtDate(r.createdAt)}</span>, text: (r) => day(r.createdAt) }, { header: 'Status', cell: (r) => <Status value={r.status} />, text: (r) => human(r.status) },
        ]} />
      <Sheet open={!!openRow} onClose={() => setOpenRow(null)} title={openRow?.subject ?? ''} subtitle={openRow && <><span className="num">{openRow.ticketNumber}</span>, {openRow.customer.name}</>}
        actions={openRow && can('TICKETS', 'EDIT') && !['RESOLVED', 'CLOSED'].includes(openRow.status) && <Button variant="primary" onClick={() => act(async () => { setOpenRow(await api(`/tickets/${openRow.id}`, { method: 'PATCH', body: { status: 'RESOLVED' } })); setRk((k) => k + 1) }, 'Ticket resolved')}>Mark resolved</Button>}>
        {openRow && <>
          <Card className="p-4"><KV rows={[['Status', <Status key="s" value={openRow.status} />], ['Priority', human(openRow.priority)], ['Assigned to', <Person key="a" user={openRow.assignee} />], ['Website', openRow.website?.name], ['Problem', <span key="d" className="whitespace-pre-wrap">{openRow.description}</span>], ['Resolution', openRow.resolutionNotes && <span className="whitespace-pre-wrap">{openRow.resolutionNotes}</span>]]} /></Card>
          <Conversation ticket={openRow} onChanged={async () => { setOpenRow(await api(`/tickets/${openRow.id}`)); setRk((k) => k + 1) }} />
          <RecordPanel entityType="TICKET" entityId={openRow.id} tabs={['timeline', 'files']} reloadKey={openRow.status} />
        </>}
      </Sheet>
    </>
  )
}

export function Documents() {
  const { lookups, can } = useAuth()
  const customers = useCustomerOptions()
  const [category, setCategory] = useState('')
  const { data, reload } = useApi<{ items: any[] }>(`/documents?limit=200${category ? `&category=${category}` : ''}`)
  const [add, setAdd] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const target = useRef<string>('')
  async function newVersion(file?: File) {
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    if (await act(() => api(`/documents/${target.current}/versions`, { form }), 'New version saved')) reload()
    if (input.current) input.current.value = ''
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Chips value={category} onChange={setCategory} options={[{ value: '', label: 'All' }, ...options(lookups.enums.DocumentCategory)]} />
        {can('DOCUMENTS', 'CREATE') && <Button variant="primary" onClick={() => setAdd(true)}><Upload size={15} />Upload document</Button>}
      </div>
      <input ref={input} type="file" className="hidden" onChange={(e) => newVersion(e.target.files?.[0])} />
      <Card className="overflow-hidden">
        {!data?.items.length ? <Empty>No documents here yet. Upload agreements, signed quotations, project files and HR files.</Empty> : (
          <Table>
            <thead><tr><Th>Document</Th><Th>Category</Th><Th>Linked to</Th><Th>Version</Th><Th>Updated</Th><Th>Owner</Th><Th /></tr></thead>
            <tbody>{data.items.map((d) => {
              const latest = d.versions[0]
              return (
                <tr key={d.id}>
                  <Td><Two top={d.title} bottom={latest?.file.fileName} /></Td><Td>{human(d.category)}</Td><Td>{d.customer?.name ?? d.project?.name ?? personName(d.employee) ?? ''}</Td>
                  <Td className="num">v{d.currentVersion}</Td><Td className="text-muted">{fmtDate(d.updatedAt)}</Td><Td>{personName(d.owner)}</Td>
                  <Td><div className="flex justify-end gap-1">
                    {latest && <Button size="icon" variant="ghost" aria-label="Download latest version" onClick={() => downloadFile(latest.file.id, latest.file.fileName).catch((e) => toast.error(e.message))}><Download size={15} /></Button>}
                    {can('DOCUMENTS', 'CREATE') && <Button size="sm" onClick={() => { target.current = d.id; input.current?.click() }}>New version</Button>}
                    {can('DOCUMENTS', 'DELETE') && <Button size="icon" variant="ghost" aria-label="Delete document" onClick={() => act(() => api(`/documents/${d.id}`, { method: 'DELETE' }), 'Document deleted').then(reload)}><Trash2 size={15} /></Button>}
                  </div></Td>
                </tr>
              )
            })}</tbody>
          </Table>
        )}
      </Card>
      <p className="text-xs text-muted">Each upload becomes a new version and earlier versions are kept. HR files are visible only to roles with HR access.</p>
      <FormDialog open={add} onClose={() => setAdd(false)} title="Upload document" submitLabel="Upload" initial={{ category: 'AGREEMENT' }}
        fields={[{ name: 'title', label: 'Title', required: true, full: true }, { name: 'category', label: 'Category', type: 'select', options: options(lookups.enums.DocumentCategory).filter((o) => o.value !== 'HR_FILE' || can('HR')), required: true }, { name: 'customerId', label: 'Customer', type: 'select', options: customers }, { name: 'file', label: 'File, up to 25 MB', type: 'file', required: true, full: true }, { name: 'description', label: 'Notes', type: 'textarea' }]}
        onSubmit={async (v) => {
          const form = new FormData()
          for (const [k, val] of Object.entries(v)) if (val) form.append(k, val as any)
          await api('/documents', { form })
          toast.success('Document uploaded')
          reload()
        }} />
    </div>
  )
}
