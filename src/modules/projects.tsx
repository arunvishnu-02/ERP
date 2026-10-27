'use client'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog, FormDialog } from '@/components/form'
import { Workflow } from '@/components/misc'
import { RecordPanel } from '@/components/record'
import { Resource } from '@/components/resource'
import { PeoplePicker } from '@/components/people'
import { Button, Card, cn, Dialog, Field as UiField, Input, KV, Loading, Panel, Progress, Select, Sheet, Status, Table, Td, Textarea, Th, Two } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useUrlParam } from '@/lib/url'
import { day, fmtDate, human, inr, options, personName, plusDays } from '@/lib/format'
import { act, DueTag, Person, useAssignees, useCustomerOptions } from './common'
import { InvoiceSheet } from './invoices'

function stepOf(p: any) {
  if (p.status === 'COMPLETED') return 8
  const ms: any[] = p.milestones
  if (ms.length && ms.every((m) => m.status !== 'PENDING' && m.status !== 'IN_PROGRESS' && m.invoice?.status === 'PAID')) return 7
  if (ms.some((m) => m.invoice && !['DRAFT', 'PAID'].includes(m.invoice.status))) return 6
  if (ms.some((m) => m.status === 'COMPLETED')) return 5
  return 4
}

type Candidate = { id: string; name: string; email: string; designation: string | null; managerId: string | null; roles: string[]; teamLeader: boolean; team: string[] }
type Eligible = { departments: { id: string; name: string; people: Candidate[] }[]; managers: { id: string; name: string }[]; canCrossDepartment: boolean }

/**
 * Create or edit a project. Admin or a Manager picks the department, then only that department's active people show
 * for Team Leader and members. Only Admin can open a project to more departments. Others edit only the work details.
 */
export function ProjectDialog({ open, row, onClose, onSaved }: { open: boolean; row?: any; onClose: () => void; onSaved: () => void }) {
  const { lookups, admin, scope } = useAuth()
  const planner = ['ALL', 'DEPARTMENT'].includes(scope('PROJECTS', 'EDIT') ?? '')
  const customers = useCustomerOptions(open)
  const { data: el, error: elError } = useApi<Eligible>(open && planner ? '/projects/eligible' : null)
  const [v, setV] = useState<Record<string, any>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!open) return
    setErr('')
    setV(row ? {
      name: row.name, customerId: row.customerId, category: row.category, description: row.description ?? '', startDate: day(row.startDate), dueDate: day(row.dueDate), priority: row.priority,
      status: row.status === 'COMPLETED' ? 'IN_REVIEW' : row.status, budget: row.budget ?? '', departmentId: row.departmentId ?? '', managerId: row.managerId ?? '', teamLeadId: row.teamLeadId ?? '',
      memberIds: (row.members ?? []).map((m: any) => m.userId), crossDepartment: !!row.crossDepartment, extraDepartmentIds: (row.extraDepartments ?? []).map((x: any) => x.department.id),
    } : { category: 'OTHER', priority: 'MEDIUM', status: 'PLANNING', startDate: plusDays(0), departmentId: '', managerId: '', teamLeadId: '', memberIds: [], crossDepartment: false, extraDepartmentIds: [] })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const deps = el?.departments ?? []
  const allowed = v.departmentId ? [v.departmentId, ...(v.crossDepartment ? v.extraDepartmentIds ?? [] : [])] : []
  const pool = deps.filter((d) => allowed.includes(d.id)).flatMap((d) => d.people.map((p) => ({ ...p, dept: d.name })))
  const leaders = pool.filter((p) => p.teamLeader)
  const leader = pool.find((p) => p.id === v.teamLeadId)
  const memberPool = pool.filter((p) => p.id !== v.managerId && p.id !== v.teamLeadId)
  const set = (k: string, x: any) => setV((s) => ({ ...s, [k]: x }))
  // after a department change, drop the Team Leader and members who are no longer in an allowed department
  const reshape = (next: Record<string, any>) => {
    const ok = new Set(deps.filter((d) => [next.departmentId, ...(next.crossDepartment ? next.extraDepartmentIds ?? [] : [])].includes(d.id)).flatMap((d) => d.people.map((p) => p.id)))
    return { ...next, teamLeadId: ok.has(next.teamLeadId) ? next.teamLeadId : '', memberIds: (next.memberIds ?? []).filter((id: string) => ok.has(id)) }
  }
  const dropped = (next: Record<string, any>) => (v.memberIds ?? []).length - (reshape(next).memberIds ?? []).length + (v.teamLeadId && !reshape(next).teamLeadId ? 1 : 0)
  const change = (patch: Record<string, any>) => {
    const next = { ...v, ...patch }
    const n = dropped(next)
    setV(reshape(next))
    if (n > 0) toast.message(`${n} ${n === 1 ? 'person was' : 'people were'} taken off because they are not in the chosen department`)
  }
  const deptName = (id: string) => deps.find((d) => d.id === id)?.name ?? lookups.departments.find((d: any) => d.id === id)?.name ?? ''
  const people = (ids: string[]) => ids.map((id) => pool.find((p) => p.id === id)?.name ?? personName((row?.members ?? []).find((m: any) => m.userId === id)?.user)).filter(Boolean)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (planner && !admin && !v.departmentId) return setErr('Choose the department for this project')
    setBusy(true)
    try {
      const body: Record<string, any> = { name: v.name, customerId: v.customerId, category: v.category, description: v.description ?? '', startDate: v.startDate ?? '', dueDate: v.dueDate ?? '', priority: v.priority, status: v.status }
      if (admin) body.budget = v.budget === '' || v.budget == null ? '' : Number(v.budget)
      if (planner) Object.assign(body, { departmentId: v.departmentId ?? '', managerId: v.managerId ?? '', teamLeadId: v.teamLeadId ?? '', memberIds: v.memberIds ?? [] })
      if (admin) Object.assign(body, { crossDepartment: !!v.crossDepartment, extraDepartmentIds: v.crossDepartment ? v.extraDepartmentIds ?? [] : [] })
      if (row) await api(`/projects/${row.id}`, { method: 'PATCH', body })
      else await api('/projects', { body })
      toast.success(row ? 'Project saved' : 'Project created. Everyone on it can see it now.')
      onSaved()
      onClose()
    } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }

  const loadingPeople = planner && !el && !elError
  return (
    <Dialog open={open} onClose={onClose} title={row ? `Edit ${row.name}` : 'New project'} size="lg"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="project-form" loading={busy} disabled={loadingPeople}>{row ? 'Save project' : 'Create project'}</Button></>}>
      <form id="project-form" onSubmit={submit} className="space-y-5">
        <section className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
          <h3 className="text-[13px] font-semibold tracking-wide text-muted uppercase sm:col-span-2">The work</h3>
          <UiField label="Project name" className="sm:col-span-2"><Input required value={v.name ?? ''} onChange={(e) => set('name', e.target.value)} /></UiField>
          <UiField label="Client">
            <Select required value={v.customerId ?? ''} onChange={(e) => set('customerId', e.target.value)}>
              <option value="">Choose a client</option>{customers.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </UiField>
          <UiField label="Type of work"><Select value={v.category ?? 'OTHER'} onChange={(e) => set('category', e.target.value)}>{options(lookups.enums.ServiceCategory).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></UiField>
          <UiField label="Start date"><Input type="date" value={v.startDate ?? ''} onChange={(e) => set('startDate', e.target.value)} /></UiField>
          <UiField label="Deadline"><Input type="date" value={v.dueDate ?? ''} onChange={(e) => set('dueDate', e.target.value)} /></UiField>
          <UiField label="Priority"><Select value={v.priority ?? 'MEDIUM'} onChange={(e) => set('priority', e.target.value)}>{options(lookups.enums.Priority).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></UiField>
          <UiField label="Status"><Select value={v.status ?? 'PLANNING'} onChange={(e) => set('status', e.target.value)}>{options(lookups.enums.ProjectStatus.filter((s: string) => s !== 'COMPLETED')).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></UiField>
          {admin && <UiField label="Budget (₹)"><Input type="number" step="any" value={v.budget ?? ''} onChange={(e) => set('budget', e.target.value)} /></UiField>}
          <UiField label="Description" className="sm:col-span-2"><Textarea value={v.description ?? ''} onChange={(e) => set('description', e.target.value)} /></UiField>
        </section>

        <section className="space-y-3.5">
          <h3 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Department and people</h3>
          {!planner ? (
            <div className="rounded-xl border border-line px-3.5 py-3 text-[13px]">
              <KV rows={[['Department', row?.department?.name ?? 'None'], ['Team Leader', personName(row?.teamLead) || 'None'], ['Manager', personName(row?.manager) || 'None'], ['Members', (row?.members ?? []).map((m: any) => personName(m.user)).join(', ') || 'None']]} />
              <p className="mt-2 text-xs text-muted">Only Admin or a Manager can change the department or who is on this project.</p>
            </div>
          ) : loadingPeople ? <Loading /> : elError ? <p className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-[13px] text-bad">Could not load people: {elError.message}</p> : (
            <>
              <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
                <UiField label="Department" help={admin ? undefined : 'You can plan projects for your own department.'}>
                  <Select required={!admin} value={v.departmentId ?? ''} onChange={(e) => change({ departmentId: e.target.value, extraDepartmentIds: (v.extraDepartmentIds ?? []).filter((x: string) => x !== e.target.value) })}>
                    <option value="">{admin ? 'No department' : 'Choose a department'}</option>
                    {deps.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </Select>
                </UiField>
                <UiField label="Project manager">
                  <Select value={v.managerId ?? ''} onChange={(e) => change({ managerId: e.target.value, memberIds: (v.memberIds ?? []).filter((x: string) => x !== e.target.value) })}>
                    <option value="">Me</option>
                    {(el?.managers ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </Select>
                </UiField>
                <UiField label="Team Leader" help={!v.departmentId ? 'Choose the department first.' : leaders.length ? 'Runs the project and gives tasks to the team.' : 'No active Team Leader in this department yet. Add one in Settings > Users.'}>
                  <Select value={v.teamLeadId ?? ''} disabled={!v.departmentId} onChange={(e) => change({ teamLeadId: e.target.value, memberIds: (v.memberIds ?? []).filter((x: string) => x !== e.target.value) })}>
                    <option value="">No Team Leader</option>
                    {leaders.map((p) => <option key={p.id} value={p.id}>{p.name}{allowed.length > 1 ? ` (${p.dept})` : ''}</option>)}
                  </Select>
                </UiField>
                {admin && el?.canCrossDepartment && (
                  <UiField label="Cross-department project" group>
                    <span className="flex h-9 items-center gap-2 text-sm">
                      <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={!!v.crossDepartment} disabled={!v.departmentId} onChange={(e) => change({ crossDepartment: e.target.checked, extraDepartmentIds: e.target.checked ? v.extraDepartmentIds ?? [] : [] })} />
                      Let people from other departments join
                    </span>
                  </UiField>
                )}
              </div>
              {admin && v.crossDepartment && (
                <UiField label="Other departments on this project" group>
                  <span className="flex flex-wrap gap-1.5">{deps.filter((d) => d.id !== v.departmentId).map((d) => {
                    const on = (v.extraDepartmentIds ?? []).includes(d.id)
                    return <button key={d.id} type="button" aria-pressed={on} onClick={() => change({ extraDepartmentIds: on ? v.extraDepartmentIds.filter((x: string) => x !== d.id) : [...(v.extraDepartmentIds ?? []), d.id] })} className={cn('rounded-full border px-2.5 py-1 text-[13px]', on ? 'border-accent-strong bg-accent-soft text-ink' : 'border-line bg-surface text-muted hover:text-ink')}>{d.name}</button>
                  })}</span>
                </UiField>
              )}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-muted">Team members</span>
                  {leader && leader.team.length > 0 && <Button size="sm" onClick={() => set('memberIds', [...new Set([...(v.memberIds ?? []), ...leader.team.filter((id) => memberPool.some((p) => p.id === id))])])}>Add {leader.name}&apos;s team ({leader.team.length})</Button>}
                </div>
                {v.departmentId
                  ? <PeoplePicker people={memberPool.map((p) => ({ id: p.id, name: p.name, hint: p.designation, tag: allowed.length > 1 ? p.dept : p.roles.join(', ') }))} value={v.memberIds ?? []} onChange={(ids) => set('memberIds', ids)} empty="No active people in this department yet." />
                  : <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-[13px] text-muted">{admin ? 'Choose a department to pick people. Without one, only you and the manager see the project.' : 'Choose the department first.'}</p>}
              </div>
            </>
          )}
        </section>

        {planner && !loadingPeople && (
          <div className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-[13px]">
            <span className="font-medium">Who sees this project: </span>
            {[
              'Admin',
              v.departmentId ? `${deptName(v.departmentId)} Managers` : null,
              v.crossDepartment && (v.extraDepartmentIds ?? []).length ? `and ${v.extraDepartmentIds.map(deptName).join(', ')} Managers` : null,
              leader ? `Team Leader ${leader.name}` : null,
              (v.memberIds ?? []).length ? `${(v.memberIds ?? []).length} ${(v.memberIds ?? []).length === 1 ? 'member' : 'members'}: ${people(v.memberIds).slice(0, 6).join(', ')}${(v.memberIds ?? []).length > 6 ? ' and more' : ''}` : 'no members yet',
            ].filter(Boolean).join(', ')}.
          </div>
        )}
        {err && <p role="alert" className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-[13px] text-bad">{err}</p>}
      </form>
    </Dialog>
  )
}

function ProjectSheet({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { can, lookups, admin } = useAuth()
  const assignees = useAssignees()
  const { data: p, reload } = useApi<any>(id ? `/projects/${id}/detail` : null)
  const [dlg, setDlg] = useState<null | 'milestone' | 'edit' | 'task' | 'complete'>(null)
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const open = !!id && p?.id === id
  const edit = can('PROJECTS', 'EDIT') && p?.status !== 'COMPLETED'
  const changed = () => { reload(); setTick((t) => t + 1); onChanged() }
  const allDone = !!p && p.milestones.every((m: any) => m.status !== 'PENDING' && m.status !== 'IN_PROGRESS')
  return (
    <>
      <Sheet open={open} onClose={onClose} title={p?.name ?? ''} subtitle={p && <><span className="num">{p.projectNumber}</span>, {p.customer.name}</>}
        actions={p && edit && <><Button onClick={() => setDlg('edit')}><Pencil size={15} />Edit</Button><Button onClick={() => setDlg('milestone')}><Plus size={15} />Milestone</Button><Button variant={allDone ? 'primary' : 'secondary'} onClick={() => setDlg('complete')}>Mark project completed</Button></>}>
        {p && <>
          <Workflow step={stepOf(p)} />
          <Card className="p-4">
            <KV rows={[
              ['Status', <Status key="s" value={p.status} />], ['Type of work', human(p.category)], ['Department', [p.department?.name, ...(p.crossDepartment ? (p.extraDepartments ?? []).map((x: any) => x.department.name) : [])].filter(Boolean).join(', ') || 'None'],
              ['Manager', <Person key="m" user={p.manager} />], ['Team Leader', p.teamLead ? <Person key="tl" user={p.teamLead} /> : p.team?.lead ? <Person key="tl" user={p.team.lead} /> : 'None'],
              ['Members', p.members.length ? p.members.map((m: any) => personName(m.user)).join(', ') : ''], ['Dates', [p.startDate && `from ${fmtDate(p.startDate)}`, p.dueDate && `due ${fmtDate(p.dueDate)}`].filter(Boolean).join(', ')],
              ...(admin ? [['Budget', p.budget ? inr(p.budget) : ''] as [string, React.ReactNode]] : []), ['Quotation', p.quotation && <span className="num">{p.quotation.quotationNumber}</span>], ['About', p.description],
            ]} />
            <div className="mt-3 flex items-center gap-3 text-[13px] text-muted"><Progress value={p.progressPercent} /><span className="num shrink-0">{p.progressPercent}% of milestones done</span></div>
          </Card>
          <Panel title="Milestones" flush>
            {p.milestones.length ? (
              <Table>
                <thead><tr><Th>Milestone</Th>{admin && <Th right>Value</Th>}<Th>Work</Th><Th>Invoice</Th><Th /></tr></thead>
                <tbody>{p.milestones.map((m: any) => {
                  const done = m.status !== 'PENDING' && m.status !== 'IN_PROGRESS'
                  return (
                    <tr key={m.id}>
                      <Td><Two top={<span className="font-normal">{m.name}</span>} bottom={m.dueDate && `Due ${fmtDate(m.dueDate)}`} /></Td>{admin && <Td right>{m.amount ? inr(m.amount) : ''}</Td>}<Td><Status value={done ? 'DONE' : 'PENDING'} /></Td>
                      <Td>{m.invoice ? <button className="flex items-center gap-2 text-accent-strong hover:underline" onClick={() => setInvoiceId(m.invoice.id)}><span className="num">{m.invoice.invoiceNumber.startsWith('DRAFT-') ? 'Draft' : m.invoice.invoiceNumber}</span><Status value={m.invoice.status} /></button> : <span className="text-muted">{m.isBillable ? 'Not raised' : 'Not billable'}</span>}</Td>
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
          <Panel title={`Tasks (${p.openTasks} open)`} action={<div className="flex gap-2"><Link href={`/tasks?project=${p.id}`} className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-[13px] font-medium hover:bg-surface-2">Open task board</Link>{can('TASKS', 'CREATE') && p.status !== 'COMPLETED' && <Button size="sm" variant="primary" onClick={() => setDlg('task')}><Plus size={14} />Add task</Button>}</div>}>
            {p.tasks.length ? <ul className="divide-y divide-line text-sm">{p.tasks.map((t: any) => <li key={t.id}><Link href={`/tasks?open=${t.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-accent-strong"><span className="min-w-0"><span className="block truncate font-medium">{t.title}</span><span className="block truncate font-serif text-[13px] text-muted">{[personName(t.assignee) || 'Not assigned', t.dueDate && `due ${fmtDate(t.dueDate)}`].filter(Boolean).join(' · ')}</span></span><Status value={t.status} /></Link></li>)}</ul> : <p className="text-sm text-muted">No tasks on this project yet.</p>}
          </Panel>
          <RecordPanel entityType="PROJECT" entityId={p.id} reloadKey={tick} tabs={['timeline', 'comments', 'notes', 'files']} />
        </>}
      </Sheet>
      {p && <>
        <FormDialog open={dlg === 'milestone'} onClose={() => setDlg(null)} title="Add milestone" submitLabel="Add milestone" fields={[{ name: 'name', label: 'Milestone', required: true, full: true }, ...(admin ? [{ name: 'amount', label: 'Value to invoice (₹)', type: 'number' as const, help: 'Leave empty if it is not billed' }] : []), { name: 'dueDate', label: 'Due date', type: 'date' }]} onSubmit={async (v) => { await api(`/projects/${p.id}/milestones`, { body: v }); changed() }} />
        <ProjectDialog open={dlg === 'edit'} row={p} onClose={() => setDlg(null)} onSaved={changed} />
        <FormDialog open={dlg === 'task'} onClose={() => setDlg(null)} title="Add task" submitLabel="Add task" initial={{ priority: 'MEDIUM', dueDate: plusDays(2) }} fields={[{ name: 'title', label: 'Task', required: true, full: true }, { name: 'assigneeId', label: 'Assign to', type: 'select', options: assignees, placeholder: 'Me' }, { name: 'priority', label: 'Priority', type: 'select', options: options(lookups.enums.Priority), required: true }, { name: 'dueDate', label: 'Due date', type: 'date' }]} onSubmit={async (v) => { await api('/tasks', { body: { ...v, projectId: p.id } }); toast.success('Task added'); changed() }} />
        <ConfirmDialog open={dlg === 'complete'} onClose={() => setDlg(null)} title="Mark this project as completed?" confirmLabel="Mark completed" onConfirm={async () => { await api(`/projects/${p.id}/complete`, { method: 'POST' }); toast.success('Project completed'); changed() }}>Every milestone must be completed and every invoice paid. The project then moves to Completed.</ConfirmDialog>
      </>}
      <InvoiceSheet id={invoiceId} onClose={() => setInvoiceId(null)} onChanged={changed} />
    </>
  )
}

export default function Projects() {
  const { lookups, can, scope } = useAuth()
  const planner = ['ALL', 'DEPARTMENT'].includes(scope('PROJECTS', 'EDIT') ?? '')
  const [openId, setOpenId] = useState<string | null>(null)
  useUrlParam('open', setOpenId)
  const [rk, setRk] = useState(0)
  const [dept, setDept] = useState('')
  const [form, setForm] = useState<{ row?: any } | null>(null)
  return (
    <>
      <Resource path="/projects" module="PROJECTS" noun="project" search="Search project or customer" exportName="projects" reloadKey={rk} onOpen={(r) => setOpenId(r.id)}
        canCreate={planner} onCreate={() => setForm({})} canEdit={false} query={{ departmentId: dept || undefined }}
        rowActions={(r) => can('PROJECTS', 'EDIT') && r.status !== 'COMPLETED' ? <Button size="icon" variant="ghost" aria-label="Edit project" onClick={() => setForm({ row: r })}><Pencil size={15} /></Button> : null}
        toolbar={() => lookups.departments.length > 1 ? (
          <Select aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value)} className="w-44">
            <option value="">All departments</option>
            {lookups.departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        ) : null}
        filter={{ param: 'status', options: [{ value: '', label: 'All' }, { value: 'PLANNING', label: 'Planning' }, { value: 'IN_PROGRESS', label: 'In progress' }, { value: 'ON_HOLD', label: 'On hold' }, { value: 'COMPLETED', label: 'Completed' }] }}
        empty={dept ? 'No projects in this department yet.' : planner ? 'No projects yet. A project is created when an accepted quotation is converted, or you can add one here.' : 'No projects for you yet. They show here once you are put on one.'}
        columns={[
          { header: 'Project', cell: (r) => <Two top={r.name} bottom={<span className="num">{r.projectNumber}</span>} />, text: (r) => r.name }, { header: 'Customer', cell: (r) => r.customer.name, text: (r) => r.customer.name },
          { header: 'Department', cell: (r) => r.department ? <Two top={<span className="font-normal">{r.department.name}</span>} bottom={r.crossDepartment && r.extraDepartments?.length ? `+ ${r.extraDepartments.map((x: any) => x.department.name).join(', ')}` : undefined} /> : <span className="text-muted">None</span>, text: (r) => r.department?.name ?? '' },
          { header: 'Manager', cell: (r) => <Person user={r.manager} />, text: (r) => personName(r.manager) },
          { header: 'Team Leader', cell: (r) => r.teamLead ? <Two top={<span className="font-normal">{personName(r.teamLead)}</span>} bottom={r.members?.length ? `${r.members.length} ${r.members.length === 1 ? 'member' : 'members'}` : undefined} /> : r.team?.lead ? personName(r.team.lead) : <span className="text-muted">None</span>, text: (r) => personName(r.teamLead ?? r.team?.lead) },
          { header: 'Progress', cell: (r) => <div className="flex min-w-28 items-center gap-2"><Progress value={r.progressPercent} /><span className="num text-xs text-muted">{r.progressPercent}%</span></div>, text: (r) => r.progressPercent },
          { header: 'Due', cell: (r) => <DueTag date={r.dueDate} done={['COMPLETED', 'CANCELLED'].includes(r.status)} />, text: (r) => day(r.dueDate) }, { header: 'Status', cell: (r) => <Status value={r.status} />, text: (r) => human(r.status) },
        ]} />
      <ProjectDialog open={!!form} row={form?.row} onClose={() => setForm(null)} onSaved={() => setRk((k) => k + 1)} />
      <ProjectSheet id={openId} onClose={() => setOpenId(null)} onChanged={() => setRk((k) => k + 1)} />
    </>
  )
}
