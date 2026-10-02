'use client'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FormDialog, type Field } from '@/components/form'
import { Resource } from '@/components/resource'
import { Button, Card, cn, Progress, Status, Tabs, Two } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { day, fmtDate, human, inr, options, personName, todayStr, toneOf } from '@/lib/format'
import { Person, useCustomerOptions, userOptions } from './common'

const TONE_BG: Record<string, string> = { good: 'bg-good-soft text-good', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad', info: 'bg-info-soft text-info', accent: 'bg-accent-soft text-accent', mute: 'bg-surface-2 text-muted' }

function useContentFields(): Field[] {
  const { lookups } = useAuth()
  const customers = useCustomerOptions()
  const campaigns = useApi<{ items: any[] }>('/campaigns?limit=200').data?.items ?? []
  return [
    { name: 'title', label: 'Title', required: true, full: true }, { name: 'type', label: 'Type', type: 'select', options: options(lookups.enums.ContentType), required: true },
    { name: 'platform', label: 'Platform', type: 'select', options: options(lookups.enums.SocialPlatform), required: true }, { name: 'customerId', label: 'Customer', type: 'select', options: customers, required: true },
    { name: 'campaignId', label: 'Campaign', type: 'select', options: campaigns.map((c) => ({ value: c.id, label: c.name })) }, { name: 'scheduledAt', label: 'Publish date', type: 'date' },
    { name: 'assigneeId', label: 'Assigned to', type: 'select', options: userOptions(lookups) }, { name: 'status', label: 'Status', type: 'select', options: options(lookups.enums.ContentStatus), required: true },
    { name: 'postUrl', label: 'Link to the published post', full: true }, { name: 'caption', label: 'Caption or brief', type: 'textarea' },
  ]
}
const contentDefaults = { type: 'POSTER', platform: 'INSTAGRAM', status: 'IDEA' }
const toForm = (r: any) => ({ ...r, scheduledAt: day(r.scheduledAt), campaignId: r.campaignId ?? '', assigneeId: r.assigneeId ?? '', postUrl: r.postUrl ?? '', caption: r.caption ?? '' })

function Calendar({ fields }: { fields: Field[] }) {
  const { can } = useAuth()
  const [month, setMonth] = useState(todayStr().slice(0, 7))
  const [form, setForm] = useState<{ row?: any; date?: string } | null>(null)
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  const { data, reload } = useApi<{ items: any[] }>(`/content-items?from=${month}-01&to=${month}-${String(last).padStart(2, '0')}&limit=500`)
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7
  const days = useMemo(() => Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`), [month, last])
  const shift = (n: number) => { const d = new Date(y, m - 1 + n, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft size={16} /></Button>
        <h3 className="min-w-36 text-center font-display text-base font-semibold">{new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h3>
        <Button size="icon" aria-label="Next month" onClick={() => shift(1)}><ChevronRight size={16} /></Button>
        <div className="flex-1" />
        {can('MARKETING', 'CREATE') && <Button variant="primary" onClick={() => setForm({})}><Plus size={16} />Add content</Button>}
      </div>
      <Card className="overflow-x-auto p-2">
        <div className="grid min-w-[720px] grid-cols-7 gap-1">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="px-1.5 py-1 text-xs text-muted">{d}</div>)}
          {Array.from({ length: lead }, (_, i) => <div key={`b${i}`} />)}
          {days.map((d) => (
            <div key={d} className={cn('min-h-24 rounded-lg border border-line p-1', d === todayStr() && 'border-accent ring-1 ring-accent')}>
              <button className="num block w-full rounded px-1 text-left text-xs text-muted hover:bg-surface-2" aria-label={`Add content on ${fmtDate(d)}`} onClick={can('MARKETING', 'CREATE') ? () => setForm({ date: d }) : undefined}>{Number(d.slice(8))}</button>
              {(data?.items ?? []).filter((c) => day(c.scheduledAt) === d).map((c) => (
                <button key={c.id} title={`${human(c.type)}, ${human(c.status)}`} onClick={() => setForm({ row: c })} className={cn('mt-1 block w-full truncate rounded px-1.5 py-1 text-left text-[11.5px] leading-tight', TONE_BG[toneOf(c.status)])}>
                  <b className="font-semibold">{human(c.type)}</b> {c.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      </Card>
      <p className="text-xs text-muted">Colours follow the status: grey for ideas, blue while being made, amber in review, green once approved or published.</p>
      <FormDialog open={!!form} onClose={() => setForm(null)} title={form?.row ? 'Edit content' : 'Add content'} fields={fields} submitLabel={form?.row ? 'Save changes' : 'Add content'}
        initial={form?.row ? toForm(form.row) : { ...contentDefaults, scheduledAt: form?.date ?? '' }}
        onSubmit={async (v) => { if (form?.row) await api(`/content-items/${form.row.id}`, { method: 'PATCH', body: v }); else await api('/content-items', { body: v }); toast.success('Saved'); reload() }} />
    </div>
  )
}

export default function Marketing() {
  const { lookups } = useAuth()
  const customers = useCustomerOptions()
  const fields = useContentFields()
  const campaigns = useApi<{ items: any[] }>('/campaigns?limit=200').data?.items ?? []
  const [tab, setTab] = useState('calendar')
  return (
    <div className="space-y-3">
      <Tabs value={tab} onChange={setTab} options={[{ value: 'calendar', label: 'Content calendar' }, { value: 'content', label: 'Posters, reels and posts' }, { value: 'campaigns', label: 'Campaigns' }, { value: 'spend', label: 'Ad spend' }]} />
      {tab === 'calendar' && <Calendar fields={fields} />}
      {tab === 'content' && (
        <Resource path="/content-items" module="MARKETING" noun="content item" search="Search title or customer" fields={fields} defaults={contentDefaults} toForm={toForm}
          filter={{ param: 'type', options: [{ value: '', label: 'All' }, ...options(lookups.enums.ContentType)] }}
          columns={[{ header: 'Content', cell: (r) => <Two top={r.title} bottom={r.campaign?.name} /> }, { header: 'Type', cell: (r) => human(r.type) }, { header: 'Customer', cell: (r) => r.customer.name }, { header: 'Platform', cell: (r) => human(r.platform) }, { header: 'Publish date', cell: (r) => fmtDate(r.scheduledAt) }, { header: 'Assigned to', cell: (r) => <Person user={r.assignee} /> }, { header: 'Status', cell: (r) => <Status value={r.status} /> }]} />
      )}
      {tab === 'campaigns' && (
        <Resource path="/campaigns" module="MARKETING" noun="campaign" search="Search campaign or customer" defaults={{ status: 'PLANNED', startDate: todayStr(), platforms: [] }}
          toForm={(r) => ({ ...r, startDate: day(r.startDate), endDate: day(r.endDate), budget: r.budget ?? '', objective: r.objective ?? '' })}
          fields={[{ name: 'name', label: 'Campaign', required: true, full: true }, { name: 'customerId', label: 'Customer', type: 'select', options: customers, required: true }, { name: 'managerId', label: 'Managed by', type: 'select', options: userOptions(lookups), placeholder: 'Me' }, { name: 'status', label: 'Status', type: 'select', options: options(lookups.enums.CampaignStatus), required: true }, { name: 'budget', label: 'Ad budget (₹)', type: 'number' }, { name: 'startDate', label: 'Starts', type: 'date', required: true }, { name: 'endDate', label: 'Ends', type: 'date' }, { name: 'platforms', label: 'Platforms', type: 'multi', options: options(lookups.enums.SocialPlatform) }, { name: 'objective', label: 'Objective', type: 'textarea' }]}
          columns={[
            { header: 'Campaign', cell: (r) => <Two top={r.name} bottom={r.customer.name} /> }, { header: 'Platforms', cell: (r) => <span className="text-muted">{r.platforms.map(human).join(', ')}</span>, className: 'max-w-52' }, { header: 'Managed by', cell: (r) => <Person user={r.manager} /> },
            { header: 'Ad budget used', cell: (r) => (r.budget ? <div className="min-w-40"><Progress value={(r.spent / r.budget) * 100} hot={r.spent / r.budget > 0.9} /><div className="num mt-1 text-xs text-muted">{inr(r.spent)} of {inr(r.budget)}</div></div> : <span className="num text-muted">{inr(r.spent)} spent</span>) },
            { header: 'Leads', right: true, cell: (r) => r.leads }, { header: 'Status', cell: (r) => <Status value={r.status} /> },
          ]} />
      )}
      {tab === 'spend' && (
        <Resource path="/ad-spend" module="MARKETING" noun="ad spend entry" defaults={{ spendDate: todayStr(), platform: 'META_ADS' }} empty="No ad spend recorded. Add what was spent each day or week against a campaign."
          toForm={(r) => ({ ...r, spendDate: day(r.spendDate), impressions: r.impressions ?? '', clicks: r.clicks ?? '', leads: r.leads ?? '' })}
          fields={[{ name: 'campaignId', label: 'Campaign', type: 'select', options: campaigns.map((c) => ({ value: c.id, label: c.name })), required: true, full: true }, { name: 'platform', label: 'Platform', type: 'select', options: options(lookups.enums.SocialPlatform), required: true }, { name: 'spendDate', label: 'Date', type: 'date', required: true }, { name: 'amount', label: 'Amount spent (₹)', type: 'number', required: true }, { name: 'impressions', label: 'Impressions', type: 'number' }, { name: 'clicks', label: 'Clicks', type: 'number' }, { name: 'leads', label: 'Leads', type: 'number' }]}
          columns={[{ header: 'Date', cell: (r) => fmtDate(r.spendDate) }, { header: 'Campaign', cell: (r) => r.campaign.name }, { header: 'Platform', cell: (r) => human(r.platform) }, { header: 'Spent', right: true, cell: (r) => inr(r.amount) }, { header: 'Impressions', right: true, cell: (r) => r.impressions?.toLocaleString('en-IN') }, { header: 'Clicks', right: true, cell: (r) => r.clicks?.toLocaleString('en-IN') }, { header: 'Leads', right: true, cell: (r) => r.leads }]} />
      )}
    </div>
  )
}
