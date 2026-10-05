'use client'
// HR, Hiring: job openings and a board of the people who applied, from first contact to joining.
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { FormDialog, type Field } from '@/components/form'
import { Board } from '@/components/misc'
import { Avatar, Button, Card, Badge, cn } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { ago, day, fmtDate, fmtDateTime, inr, options, personName, plusDays } from '@/lib/format'
import { act } from './common'

const COLUMNS = [{ key: 'APPLIED', label: 'Applied' }, { key: 'INTERVIEW', label: 'Interview' }, { key: 'OFFER', label: 'Offer sent' }, { key: 'JOINED', label: 'Joined' }]
const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn() }

export default function Hiring() {
  const { lookups, can, reloadLookups } = useAuth()
  const edit = can('HR', 'EDIT')
  const openings = useApi<{ items: any[] }>('/hr/hiring/openings?limit=100')
  const [job, setJob] = useState('')
  const { data, reload } = useApi<{ items: any[] }>(`/hr/hiring/candidates?limit=500${job ? `&jobId=${job}` : ''}`)
  const [dlg, setDlg] = useState<null | { kind: 'job'; row?: any } | { kind: 'cand'; row?: any } | { kind: 'interview' | 'offer' | 'reject'; row: any }>(null)
  const jobs = openings.data?.items ?? []
  const open = jobs.filter((j) => j.status === 'OPEN')
  const people = data?.items ?? []
  const shown = people.filter((c) => c.stage !== 'REJECTED')
  const rejected = people.length - shown.length
  const thisMonth = jobs.reduce((n, j) => n + j.appliedThisMonth, 0)
  const changed = () => { reload(); openings.reload() }
  const move = (c: any, stage: string) => act(() => api(`/hr/hiring/candidates/${c.id}`, { method: 'PATCH', body: { stage } })).then(changed)
  const hire = (c: any) => act(() => api(`/hr/hiring/candidates/${c.id}/hire`, { method: 'POST' }), `${c.firstName} is now an employee. Add their bank and PAN details under Employees.`).then(() => { changed(); reloadLookups() })

  const jobFields: Field[] = [
    { name: 'title', label: 'Role', required: true, placeholder: 'UI/UX Designer' }, { name: 'departmentId', label: 'Department', type: 'select', options: lookups.departments.map((d: any) => ({ value: d.id, label: d.name })) },
    { name: 'employmentType', label: 'Type', type: 'select', options: options(lookups.enums.EmploymentType), required: true }, { name: 'location', label: 'Location', placeholder: 'Tiruchirappalli, office' },
    { name: 'salaryRange', label: 'Salary range', placeholder: '₹20,000 to ₹30,000 a month' }, { name: 'status', label: 'Status', type: 'select', options: [{ value: 'OPEN', label: 'Open' }, { value: 'ON_HOLD', label: 'On hold' }, { value: 'CLOSED', label: 'Closed' }], required: true },
    { name: 'description', label: 'About the role', type: 'textarea' },
  ]
  const candFields: Field[] = [
    { name: 'jobId', label: 'Applied for', type: 'select', options: jobs.map((j) => ({ value: j.id, label: j.title })), required: true },
    { name: 'firstName', label: 'First name', required: true }, { name: 'lastName', label: 'Last name' }, { name: 'phone', label: 'Phone' }, { name: 'email', label: 'Email', type: 'email' },
    { name: 'experience', label: 'Experience', placeholder: 'Fresher, or 2 years' }, { name: 'source', label: 'Came from', placeholder: 'Referral, LinkedIn, walk-in' },
    { name: 'link', label: 'Portfolio or resume link', full: true }, { name: 'notes', label: 'Notes', type: 'textarea' },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">{open.length} open role{open.length === 1 ? '' : 's'}, {thisMonth} {thisMonth === 1 ? 'person' : 'people'} applied in the last 30 days. Drag a card to move it along.</p>
        {edit && <div className="flex gap-2"><Button onClick={() => setDlg({ kind: 'job' })}><Plus size={16} />Add job opening</Button><Button variant="primary" disabled={!jobs.length} onClick={() => setDlg({ kind: 'cand' })}><Plus size={16} />Add candidate</Button></div>}
      </div>

      {!!jobs.length && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button type="button" onClick={() => setJob('')} className={cn('shrink-0 rounded-xl border px-4 py-2.5 text-left', !job ? 'border-accent bg-accent-soft' : 'border-line bg-surface')}><div className="text-sm font-semibold">All roles</div><div className="text-xs text-muted">{people.length} candidates</div></button>
          {jobs.map((j) => (
            <button key={j.id} type="button" onClick={() => setJob(j.id === job ? '' : j.id)} onDoubleClick={() => edit && setDlg({ kind: 'job', row: j })} title={edit ? 'Double-click to edit' : undefined} className={cn('shrink-0 rounded-xl border px-4 py-2.5 text-left', job === j.id ? 'border-accent bg-accent-soft' : 'border-line bg-surface', j.status !== 'OPEN' && 'opacity-60')}>
              <div className="text-sm font-semibold">{j.title}{j.status !== 'OPEN' && <span className="ml-1.5 text-xs font-normal text-muted">({j.status === 'ON_HOLD' ? 'on hold' : 'closed'})</span>}</div>
              <div className="text-xs text-muted">{j.applied} applied, open since {fmtDate(j.openedOn)}</div>
            </button>
          ))}
        </div>
      )}

      {!jobs.length && openings.data ? (
        <Card className="px-4 py-10 text-center text-sm text-muted">No job openings yet. Add the role you are hiring for, then add each person who applies.</Card>
      ) : (
        <Board
          items={shown} columns={COLUMNS} columnOf={(c: any) => c.stage} onOpen={(c: any) => edit && setDlg({ kind: 'cand', row: c })}
          onMove={edit ? (c: any, to) => (to === 'OFFER' ? setDlg({ kind: 'offer', row: c }) : to === 'INTERVIEW' && !c.interviewAt ? setDlg({ kind: 'interview', row: c }) : to === 'JOINED' ? hire(c) : move(c, to)) : undefined}
          render={(c: any) => (
            <div className="space-y-2">
              <div className="flex items-center gap-2.5"><Avatar name={personName(c)} /><div className="min-w-0"><div className="truncate font-medium">{personName(c)}</div><div className="truncate text-xs text-muted">
                {c.stage === 'APPLIED' && [c.experience, `applied ${ago(c.createdAt)}`].filter(Boolean).join(', ')}
                {c.stage === 'INTERVIEW' && (c.interviewAt ? `Interview ${fmtDateTime(c.interviewAt)}` : 'Interview not set')}
                {c.stage === 'OFFER' && `Offer sent ${fmtDate(c.offerSentAt)}${c.monthlySalary ? `, ${inr(c.monthlySalary)} a month` : ''}`}
                {c.stage === 'JOINED' && `Joins ${fmtDate(c.joiningDate)} as ${c.job.title}`}
              </div></div></div>
              {!job && <div className="text-xs text-muted">{c.job.title}</div>}
              {c.stage === 'OFFER' && <Badge tone="warn">Waiting to accept</Badge>}
              {c.stage === 'JOINED' && <Badge tone="good">Joined</Badge>}
              {edit && c.stage !== 'JOINED' && (
                <div className="flex flex-wrap gap-1.5">
                  {c.stage === 'APPLIED' && <Button size="sm" variant="primary" onClick={stop(() => setDlg({ kind: 'interview', row: c }))}>Set interview</Button>}
                  {c.stage === 'INTERVIEW' && <Button size="sm" variant="primary" onClick={stop(() => setDlg({ kind: 'offer', row: c }))}>Send offer letter</Button>}
                  {c.stage === 'OFFER' && <><Button size="sm" variant="primary" onClick={stop(() => hire(c))}>Add as employee</Button><Button size="sm" onClick={stop(() => window.open(`/print/candidate-offer/${c.id}`, '_blank'))}>Offer letter</Button></>}
                  <Button size="sm" onClick={stop(() => setDlg({ kind: 'reject', row: c }))}>Reject</Button>
                </div>
              )}
            </div>
          )}
        />
      )}
      {rejected > 0 && <p className="text-xs text-muted">{rejected} not selected, hidden from the board.</p>}
      <div className="rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm"><div className="font-semibold">Offer letters use your own template</div><div className="text-muted">Set the salary and joining date, then print the letter or save it as a PDF to send. When they accept, add them as an employee with one click.</div></div>

      <FormDialog open={dlg?.kind === 'job'} onClose={() => setDlg(null)} title={dlg?.kind === 'job' && dlg.row ? 'Edit job opening' : 'Add job opening'} fields={jobFields} submitLabel="Save"
        initial={dlg?.kind === 'job' && dlg.row ? { ...dlg.row, departmentId: dlg.row.departmentId ?? '', location: dlg.row.location ?? '', salaryRange: dlg.row.salaryRange ?? '', description: dlg.row.description ?? '' } : { employmentType: 'FULL_TIME', status: 'OPEN' }}
        onSubmit={async (v) => { const row = dlg?.kind === 'job' ? dlg.row : null; await api(row ? `/hr/hiring/openings/${row.id}` : '/hr/hiring/openings', { method: row ? 'PATCH' : 'POST', body: v }); toast.success('Job opening saved'); changed() }} />
      <FormDialog open={dlg?.kind === 'cand'} onClose={() => setDlg(null)} title={dlg?.kind === 'cand' && dlg.row ? personName(dlg.row) : 'Add candidate'} fields={candFields} submitLabel="Save"
        initial={dlg?.kind === 'cand' && dlg.row ? Object.fromEntries(candFields.map((f) => [f.name, dlg.row[f.name] ?? ''])) : { jobId: job || open[0]?.id || '' }}
        onSubmit={async (v) => { const row = dlg?.kind === 'cand' ? dlg.row : null; await api(row ? `/hr/hiring/candidates/${row.id}` : '/hr/hiring/candidates', { method: row ? 'PATCH' : 'POST', body: v }); toast.success('Candidate saved'); changed() }} />
      <FormDialog open={dlg?.kind === 'interview'} onClose={() => setDlg(null)} title="Set the interview" size="sm" submitLabel="Save" initial={{ interviewAt: `${plusDays(1)}T11:00` }}
        fields={[{ name: 'interviewAt', label: 'Date and time', type: 'datetime-local', required: true, full: true }, { name: 'notes', label: 'Notes for the panel', type: 'textarea' }]}
        onSubmit={async (v) => { const c = (dlg as any).row; await api(`/hr/hiring/candidates/${c.id}`, { method: 'PATCH', body: { stage: 'INTERVIEW', interviewAt: new Date(v.interviewAt).toISOString(), ...(v.notes ? { notes: [c.notes, v.notes].filter(Boolean).join('\n') } : {}) } }); toast.success('Interview set'); changed() }} />
      <FormDialog open={dlg?.kind === 'offer'} onClose={() => setDlg(null)} title="Send offer letter" size="sm" submitLabel="Save and open the letter"
        initial={{ monthlySalary: (dlg as any)?.row?.monthlySalary ?? '', joiningDate: day((dlg as any)?.row?.joiningDate) || plusDays(14) }}
        fields={[{ name: 'monthlySalary', label: 'Monthly salary (₹)', type: 'number', required: true }, { name: 'joiningDate', label: 'Joining date', type: 'date', required: true }]}
        onSubmit={async (v) => { const c = (dlg as any).row; await api(`/hr/hiring/candidates/${c.id}/offer-sent`, { body: v }); changed(); window.open(`/print/candidate-offer/${c.id}`, '_blank') }} />
      <FormDialog open={dlg?.kind === 'reject'} onClose={() => setDlg(null)} title={`Not selecting ${dlg && 'row' in dlg && dlg.row ? dlg.row.firstName : ''}?`} size="sm" submitLabel="Reject"
        fields={[{ name: 'rejectionReason', label: 'Reason, for your records', full: true }]}
        onSubmit={async (v) => { const c = (dlg as any).row; await api(`/hr/hiring/candidates/${c.id}`, { method: 'PATCH', body: { stage: 'REJECTED', rejectionReason: v.rejectionReason } }); toast.success('Marked as not selected'); changed() }} />
    </div>
  )
}

