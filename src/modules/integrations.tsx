'use client'
// Settings > Integrations: the apps the company already uses. Google Workspace and email work today; the rest are listed as coming later.
import { Copy, ExternalLink, FolderOpen } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog, FormDialog } from '@/components/form'
import { Badge, Button, Card } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { fmtDateTime } from '@/lib/format'

type Google = { clientId: string; hasSecret: boolean; allowedDomain: string; signIn: boolean; folderName: string; connected: boolean; connectedEmail: string | null; connectedAt: string | null; folderUrl: string | null; redirectUri: string; linkedUsers: number }
type Data = { google: Google; smtp: { active: boolean; fromEmail: string | null } }

/** What the ?google= value on the way back from Google means. */
export const GOOGLE_RESULT: Record<string, [ok: boolean, text: string]> = {
  connected: [true, 'Google is connected. Drive and Sheets are ready.'],
  cancelled: [false, 'Google was not connected because the request was cancelled.'],
  expired: [false, 'That took too long. Press Connect again.'],
  failed: [false, 'Google did not accept the request. Check the client ID and secret, then try again.'],
  denied: [false, 'Only an admin who can change settings can connect Google.'],
  domain: [false, 'That Google account is not on your company domain.'],
  unverified: [false, 'That Google account has no verified email.'],
  off: [false, 'Save the Google client ID and secret first.'],
}

const LATER: [string, string, string][] = [
  ['WA', 'WhatsApp Business', 'Send invoices, quotations, payslips and reminders automatically. Today the WhatsApp buttons open WhatsApp with the message written.'],
  ['₹', 'Razorpay', 'Let clients pay invoices by UPI, card or netbanking from the portal.'],
  ['GC', 'Google Calendar', 'Show meetings and leave on the team calendar.'],
  ['M', 'Meta Ads', 'Pull ad spend into client projects and Profit by project.'],
  ['T', 'Tally / Zoho Books', "Send invoices and expenses to your accountant's software."],
]

function AppCard({ mark, name, status, children, actions }: { mark: string; name: string; status: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-sm font-semibold text-accent">{mark}</span>
        <div className="min-w-0"><div className="font-semibold">{name}</div><div className="mt-1">{status}</div></div>
      </div>
      <div className="flex-1 text-[13px] text-muted">{children}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </Card>
  )
}

export default function Integrations({ goEmail }: { goEmail: () => void }) {
  const { can, reloadLookups } = useAuth()
  const { data, reload } = useApi<Data>('/settings/integrations')
  const [edit, setEdit] = useState(false)
  const [drop, setDrop] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!data) return null
  const g = data.google
  const mayEdit = can('SETTINGS', 'EDIT')
  const ready = !!g.clientId && g.hasSecret
  const connected = (data.smtp.active ? 1 : 0) + (g.connected || g.signIn ? 1 : 0)
  async function connect() {
    setBusy(true)
    try { const r = await api<{ url: string }>('/settings/integrations/google/connect', { method: 'POST' }); window.location.assign(r.url) } catch (e) { toast.error((e as Error).message); setBusy(false) }
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><h2 className="text-[15px] font-semibold">Connected apps</h2><Badge tone="good">{connected} of {LATER.length + 2} connected</Badge></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <AppCard mark="G" name="Google Workspace"
          status={g.connected ? <Badge tone="good">Connected</Badge> : g.signIn ? <Badge tone="good">Sign-in on</Badge> : <Badge tone="warn">Not connected</Badge>}
          actions={mayEdit && (
            <>
              <Button onClick={() => setEdit(true)}>{ready ? 'Settings' : 'Set up'}</Button>
              {ready && !g.connected && <Button variant="primary" loading={busy} onClick={connect}>Connect Drive and Sheets</Button>}
              {g.connected && <Button onClick={() => setDrop(true)}>Disconnect</Button>}
            </>
          )}>
          <p>Sign in with Google. Save files to Drive. Send any list to Google Sheets.</p>
          {(g.connected || g.signIn) && (
            <div className="mt-2 space-y-1 rounded-lg bg-surface-2 px-3 py-2 text-ink">
              {g.connected && <div>{g.connectedEmail}, connected {fmtDateTime(g.connectedAt)}</div>}
              {g.connected && <div className="flex items-center gap-1.5"><FolderOpen size={14} className="text-muted" />Drive folder: {g.folderUrl ? <a href={g.folderUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">{g.folderName}</a> : <span>{g.folderName} (made on first save)</span>}</div>}
              {g.signIn && <div>Sign in with Google is on{g.allowedDomain ? ` for @${g.allowedDomain}` : ''}. {g.linkedUsers} {g.linkedUsers === 1 ? 'person has' : 'people have'} used it.</div>}
            </div>
          )}
        </AppCard>
        <AppCard mark="@" name="Email (SMTP)" status={data.smtp.active ? <Badge tone="good">Connected</Badge> : <Badge tone="warn">Not connected</Badge>}
          actions={<Button onClick={goEmail}>{data.smtp.active ? 'Settings' : 'Set up'}</Button>}>
          {data.smtp.active ? <p>Emails go out from {data.smtp.fromEmail}.</p> : <p>Send quotations, invoices and reminders from your own mailbox, like info@ciphermutex.com.</p>}
        </AppCard>
        {LATER.map(([mark, name, text]) => (
          <AppCard key={name} mark={mark} name={name} status={<Badge>Coming later</Badge>}><p>{text}</p></AppCard>
        ))}
      </div>

      {mayEdit && (
        <Card className="p-4 text-[13px] text-muted">
          <div className="mb-2 font-semibold text-ink">How to set up Google (one time, about 10 minutes)</div>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Open <a className="text-accent hover:underline" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Google Cloud credentials <ExternalLink size={12} className="inline" /></a> with your Workspace admin account and make a project.</li>
            <li>Turn on the Google Drive API and the Google Sheets API for that project.</li>
            <li>On the OAuth consent screen choose Internal, so only your company can use it.</li>
            <li>Create an OAuth client ID of type Web application, and add this address under Authorised redirect URIs:
              <div className="mt-1 flex items-center gap-2"><code className="num rounded bg-surface-2 px-2 py-1 text-ink">{g.redirectUri}</code><Button size="icon" variant="ghost" aria-label="Copy address" onClick={() => navigator.clipboard.writeText(g.redirectUri).then(() => toast.success('Copied'))}><Copy size={14} /></Button></div>
            </li>
            <li>Paste the client ID and secret here with Set up, then press Connect Drive and Sheets.</li>
          </ol>
        </Card>
      )}

      <FormDialog open={edit} onClose={() => setEdit(false)} title="Google Workspace" submitLabel="Save"
        initial={{ clientId: g.clientId, clientSecret: '', allowedDomain: g.allowedDomain, signIn: g.signIn, folderName: g.folderName }}
        fields={[
          { name: 'clientId', label: 'OAuth client ID', required: true, placeholder: '1234-abc.apps.googleusercontent.com' },
          { name: 'clientSecret', label: g.hasSecret ? 'Client secret (leave empty to keep)' : 'Client secret', type: 'password', required: !g.hasSecret },
          { name: 'allowedDomain', label: 'Company domain', placeholder: 'ciphermutex.com', help: 'Only Google accounts on this domain can sign in or connect. Leave empty to allow any.' },
          { name: 'folderName', label: 'Drive folder name', placeholder: 'CX CRM ERP' },
          { name: 'signIn', label: 'Sign in with Google', type: 'checkbox', placeholder: 'Show "Sign in with Google" on the sign-in page. It only lets in people who already have a user here with the same email.' },
        ]}
        onSubmit={async (v) => { await api('/settings/integrations/google', { method: 'PUT', body: v }); toast.success('Google settings saved'); reload() }} />
      <ConfirmDialog open={drop} onClose={() => setDrop(false)} title="Disconnect Google Drive and Sheets?" confirmLabel="Disconnect" danger
        onConfirm={async () => { await api('/settings/integrations/google/connection', { method: 'DELETE' }); toast.success('Google disconnected'); reload(); reloadLookups() }}>
        Files already saved to Drive stay there. Nobody can save to Drive or send lists to Sheets until an admin connects again. Sign in with Google keeps working.
      </ConfirmDialog>
    </div>
  )
}
