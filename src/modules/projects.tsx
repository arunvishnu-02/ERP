'use client'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog, FormDialog, type Field } from '@/components/form'
import { Workflow } from '@/components/misc'
import { RecordPanel } from '@/components/record'
import { Resource } from '@/components/resource'
import { Button, Card, KV, Panel, Progress, Sheet, Status, Table, Td, Th, Two } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useUrlParam } from '@/lib/url'
import { day, fmtDate, human, inr, options, personName, plusDays } from '@/lib/format'
import { act, DueTag, Person, useCustomerOptions, userOptions } from './common'
import { InvoiceSheet } from './invoices'

function stepOf(p: any) {
  if (p.status === 'COMPLETED') return 8
  const ms: any[] = p.milestones
  if (ms.length && ms.every((m) => m.status !== 'PENDING' && m.status !== 'IN_PROGRESS' && m.invoice?.status === 'PAID')) return 7
  if (ms.some((m) => m.invoice && !['DRAFT', 'PAID'].includes(m.invoice.status))) return 6
  if (ms.some((m) => m.status === 'COMPLETED')) return 5
  return 4
}

function ProjectSheet({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { can, lookups } = useAuth()
  const { data: p, reload } = useApi<any>(id ? `/projects/${id}/detail` : null)
  const [dlg, setDlg] = useState<null | 'milestone' | 'members' | 'task' | 'complete'>(null)
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const open = !!id && p?.id === id
  const edit = can('PROJECTS', 'EDIT') && p?.status !== 'COMPLETED'
  const changed = () => { reload(); setTick((t) => t + 1); onChanged() }
  const allDone = !!p && p.milestones.every((m: any) => m.status !== 'PENDING' && m.status !== 'IN_PROGRESS')
  return (
    <>
      <Sheet open={open} onClose={onClose} title={p?.name ?? ''} subtitle={p && <><span className="num">{p.projectNumber}</span>, {p.customer.name}</>}
        actions={p && edit && <><Button onClick={() => setDlg('members')}>Team</Button><Button onClick={() => setDlg('milestone')}><Plus size={15} />Milestone</Button><Button variant={allDone ? 'primary' : 'secondary'} onClick={() => setDlg('complete')}>Mark project completed</Button></>}>
        {p && <>
          <Workflow step={stepOf(p)} />
          <Card className="p-4">
            <KV rows={[
              ['Status', <Status key="s" value={p.status} />], ['Type of work', human(p.category)], ['Manager', <Person key="m" user={p.manager} />],
              ['Team', p.members.length ? p.members.map((m: any) => personName(m.user)).join(', ') : ''], ['Dates', [p.startDate && `from ${fmtDate(p.startDate)}`, p.dueDate && `due ${fmtDate(p.dueDate)}`].filter(Boolean).join(', ')],
              ['Budget', p.budget ? inr(p.budget) : ''], ['Quotation', p.quotation && <span className="num">{p.quotation.quotationNumber}</span>], ['About', p.description],
            ]} />
            <div className="mt-3 flex items-center gap-3 text-[13px] text-muted"><Progress value={p.progressPercent} /><span className="num shrink-0">{p.progressPercent}% of milestones done</span></div>
          </Card>
          <Panel title="Milestones" flush>
            {p.milestones.length ? (
              <Table>
                <thead><tr><Th>Milestone</Th><Th right>Value</Th><Th>Work</Th><Th>Invoice</Th><Th /></tr></thead>
                <tbody>{p.milestones.map((m: any) => {
                  const done = m.status !== 'PENDING' && m.status !== 'IN_PROGRESS'
                  return (
                    <tr key={m.id}>
                      <Td><Two top={<span className="font-normal">{m.name}</span>} bottom={m.dueDate && `Due ${fmtDate(m.dueDate)}`} /></Td><Td right>{m.amount ? inr(m.amount) : ''}</Td><Td><Status value={done ? 'DONE' : 'PENDING'} /></Td>
                      <Td>{m.invoice ? <button className="flex items-center gap-2 text-accent hover:underline" onClick={() => setInvoiceId(m.invoice.id)}><span className="num">{m.invoice.invoiceNumber.startsWith('DRAFT-') ? 'Draft' : m.invoice.invoiceNumber}</span><Status value={m.invoice.status} /></button> : <span className="text-muted">{m.isBillable ? 'Not raised' : 'Not billable'}</span>}</Td>
                      <Td><div className="flex justify-end gap-1">
                        {!done && edit && <Button size="sm" variant="primary" onClick={() => act(async () => { const r = await api(`/projects/milestones/${m.id}/complete`, { method: 'POST' }); toast.success(r.invoice ? 'Milestone completed. A draft invoice was created for Accounts.' : 'Milestone completed') }).then(changed)}>Complete</Button>}
                        {done && !m.invoice && m.isBillable && can('INVOICES', 'CREATE') && <Button size="sm" onClick={() => act(() => api(`/projects/milestones/${m.id}/invoice`, { method: 'POST' }), 'Draft invoice created').then(changed)}>Draft invoice</Button>}
                        {!done && !m.invoice && edit && <Button size="icon" variant="ghost" aria-label="Delete milestone" onClick={() => act(() => api(`/projects/milestones/${m.id}`, { method: 'DELETE' })).then(changed)}><Trash2 size={14} /></Button>}
                      </div></Td>
                    </tr>
                  )
                })}</tbody>
              </Table>
            ) : <p className="px-4 pb-4 text-sm text-muted">No milestones yet. Add the stages of the work; billable ones produce invoices when completed.</p>}
          </Panel>
          <Panel title={`Tasks (${p.openTasks} open)`} action={can('TASKS', 'CREATE') && p.status !== 'COMPLETED' && <Button size="sm" onClick={() => setDlg('task')}>Add task</Button>}>
            {p.tasks.length ? <ul className="divide-y divide-line text-sm">{p.tasks.map((t: any) => <li key={t.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"><span className="min-w-0 truncate">{t.title}</span><span className="flex shrink-0 items-center gap-2 text-[13px] text-muted">{personName(t.assignee)}<Status value={t.status} /></span></li>)}</ul> : <p className="text-sm text-muted">No tasks on this project yet.</p>}
          </Panel>
          <RecordPanel entityType="PROJECT" entityId={p.id} reloadKey={tick} tabs={['timeline', 'comments', 'notes', 'files']} />
        </>}
      </Sheet>
      {p && <>
        <FormDialog open={dlg === 'milestone'} onClose={() => setDlg(null)} title="Add milestone" submitLabel="Add milestone" fields={[{ name: 'name', label: 'Milestone', required: true, full: true }, { name: 'amount', label: 'Value to invoice (₹)', type: 'number', help: 'Leave empty if it is not billed' }, { name: 'dueDate', label: 'Due date', type: 'date' }]} onSubmit={async (v) => { await api(`/projects/${p.id}/milestones`, { body: v }); changed() }} />
        <FormDialog open={dlg === 'members'} onClose={() => setDlg(null)} title="Project team" submitLabel="Save team" initial={{ userIds: p.members.map((m: any) => m.userId) }} fields={[{ name: 'userIds', label: 'Team members, besides the manager', type: 'multi', options: userOptions(lookups).filter((u: any) => u.value !== p.managerId) }]} onSubmit={async (v) => { await api(`/projects/${p.id}/members`, { method: 'PUT', body: v }); toast.success('Team saved'); changed() }} />
        <FormDialog open={dlg === 'task'} onClose={() => setDlg(null)} title="Add task" submitLabel="Add task" initial={{ priority: 'MEDIUM', dueDate: plusDays(2) }} fields={[{ name: 'title', label: 'Task', required: true, full: true }, { name: 'assigneeId', label: 'Assign to', type: 'select', options: userOptions(lookups), placeholder: 'Me' }, { name: 'priority', label: 'Priority', type: 'select', options: options(lookups.enums.Priority), required: true }, { name: 'dueDate', label: 'Due date', type: 'date' }]} onSubmit={async (v) => { await api('/tasks', { body: { ...v, projectId: p.id } }); toast.success('Task added'); changed() }} />
        <ConfirmDialog open={dlg === 'complete'} onClose={() => setDlg(null)} title="Mark this project as completed?" confirmLabel="Mark completed" onConfirm={async () => { await api(`/projects/${p.id}/complete`, { method: 'POST' }); toast.success('Project completed'); changed() }}>Every milestone must be completed and every invoice paid. The project then moves to Completed.</ConfirmDialog>
      </>}
      <InvoiceSheet id={invoiceId} onClose={() => setInvoiceId(null)} onChanged={changed} />
    </>
  )
}

export default function Projects() {
  const { lookups } = useAuth()
  const customers = useCustomerOptions()
  const [openId, setOpenId] = useState<string | null>(null)
  useUrlParam('open', setOpenId)
  const [rk, setRk] = useState(0)
  const fields: Field[] = [
    { name: 'name', label: 'Project name', required: true, full: true }, { name: 'customerId', label: 'Customer', type: 'select', options: customers, required: true },
    { name: 'category', label: 'Type of work', type: 'select', options: options(lookups.enums.ServiceCategory), required: true }, { name: 'managerId', label: 'Project manager', type: 'select', options: userOptions(lookups), placeholder: 'Me' },
    { name: 'priority', label: 'Priority', type: 'select', options: options(lookups.enums.Priority), required: true }, { name: 'startDate', label: 'Start date', type: 'date' }, { name: 'dueDate', label: 'Due date', type: 'date' },
    { name: 'budget', label: 'Budget (₹)', type: 'number' }, { name: 'status', label: 'Status', type: 'select', options: options(lookups.enums.ProjectStatus.filter((s: string) => s !== 'COMPLETED')), required: true }, { name: 'description', label: 'About the project', type: 'textarea' },
  ]
  return (
    <>
      <Resource path="/projects" module="PROJECTS" noun="project" search="Search project or customer" exportName="projects" fields={fields} reloadKey={rk} onOpen={(r) => setOpenId(r.id)}
        defaults={{ category: 'OTHER', priority: 'MEDIUM', status: 'PLANNING', startDate: plusDays(0) }} toForm={(r) => ({ ...r, startDate: day(r.startDate), dueDate: day(r.dueDate), budget: r.budget ?? '', description: r.description ?? '', status: r.status === 'COMPLETED' ? 'IN_REVIEW' : r.status })}
        filter={{ param: 'status', options: [{ value: '', label: 'All' }, { value: 'PLANNING', label: 'Planning' }, { value: 'IN_PROGRESS', label: 'In progress' }, { value: 'ON_HOLD', label: 'On hold' }, { value: 'COMPLETED', label: 'Completed' }] }}
        empty="No projects yet. A project is created when an accepted quotation is converted, or you can add one here."
        columns={[
          { header: 'Project', cell: (r) => <Two top={r.name} bottom={<span className="num">{r.projectNumber}</span>} />, text: (r) => r.name }, { header: 'Customer', cell: (r) => r.customer.name, text: (r) => r.customer.name },
          { header: 'Type', cell: (r) => human(r.category), text: (r) => human(r.category) }, { header: 'Manager', cell: (r) => <Person user={r.manager} />, text: (r) => personName(r.manager) },
          { header: 'Progress', cell: (r) => <div className="flex min-w-28 items-center gap-2"><Progress value={r.progressPercent} /><span className="num text-xs text-muted">{r.progressPercent}%</span></div>, text: (r) => r.progressPercent },
          { header: 'Due', cell: (r) => <DueTag date={r.dueDate} done={['COMPLETED', 'CANCELLED'].includes(r.status)} />, text: (r) => day(r.dueDate) }, { header: 'Status', cell: (r) => <Status value={r.status} />, text: (r) => human(r.status) },
        ]} />
      <ProjectSheet id={openId} onClose={() => setOpenId(null)} onChanged={() => setRk((k) => k + 1)} />
    </>
  )
}
