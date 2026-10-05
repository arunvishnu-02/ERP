'use client'
import { Play, Plus, Square } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog, FormDialog, type Field } from '@/components/form'
import { Board } from '@/components/misc'
import { RecordPanel } from '@/components/record'
import { Avatar, Badge, Button, Card, KV, Panel, Select, Sheet, Tabs } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useUrlParam } from '@/lib/url'
import { day, daysFromToday, fmtDateTime, human, options, personName, plusDays } from '@/lib/format'
import { act, DueTag, Person, userOptions } from './common'
import Timesheet from './timesheet'

const COLUMNS = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE']
const prioTone = (p: string) => (p === 'URGENT' ? 'bad' : p === 'HIGH' ? 'warn' : 'mute')
const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`)

function TaskSheet({ id, onClose, onChanged, fields }: { id: string | null; onClose: () => void; onChanged: () => void; fields: Field[] }) {
  const { can, lookups } = useAuth()
  const { data: t, reload } = useApi<any>(id ? `/tasks/${id}` : null)
  const time = useApi<{ items: any[] }>(id ? `/tasks/${id}/time` : null)
  const timer = useApi<any>(id ? '/tasks/timer' : null)
  const [dlg, setDlg] = useState<null | 'edit' | 'time' | 'delete'>(null)
  const open = !!id && t?.id === id
  const edit = can('TASKS', 'EDIT')
  const changed = () => { reload(); time.reload(); timer.reload(); onChanged() }
  const running = timer.data?.taskId === id
  return (
    <>
      <Sheet open={open} onClose={onClose} title={t?.title ?? ''} subtitle={t && <><span className="num">{t.taskNumber}</span>{t.project ? `, ${t.project.name}` : ''}</>}
        actions={t && edit && <>
          {can('TASKS', 'DELETE') && <Button variant="danger" onClick={() => setDlg('delete')}>Delete</Button>}
          <Button onClick={() => setDlg('edit')}>Edit</Button><Button onClick={() => setDlg('time')}>Log time</Button>
          {running ? <Button variant="primary" onClick={() => act(() => api(`/tasks/${t.id}/timer/stop`, { method: 'POST' }), 'Timer stopped').then(changed)}><Square size={14} />Stop timer</Button> : <Button variant="primary" disabled={!!timer.data} onClick={() => act(() => api(`/tasks/${t.id}/timer/start`, { method: 'POST' }), 'Timer started').then(changed)}><Play size={14} />Start timer</Button>}
        </>}>
        {t && <>
          <Card className="p-4">
            <KV rows={[
              ['Status', edit ? <Select key="s" className="h-8 w-auto text-[13px]" value={t.status} onChange={(e) => act(() => api(`/tasks/${t.id}`, { method: 'PATCH', body: { status: e.target.value } })).then(changed)} aria-label="Status">{options(lookups.enums.TaskStatus).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select> : human(t.status)],
              ['Priority', <Badge key="p" tone={prioTone(t.priority)}>{human(t.priority)}</Badge>], ['Assigned to', <Person key="a" user={t.assignee} />], ['Added by', personName(t.reporter)],
              ['Due', <DueTag key="d" date={t.dueDate} done={t.status === 'DONE'} />], ['Time logged', `${mins(t.loggedMinutes)}${t.estimatedMinutes ? ` of ${mins(t.estimatedMinutes)} estimated` : ''}`], ['Details', t.description && <span className="whitespace-pre-wrap">{t.description}</span>],
            ]} />
          </Card>
          {!!time.data?.items.length && (
            <Panel title="Time entries"><ul className="divide-y divide-line text-sm">{time.data.items.map((e) => <li key={e.id} className="flex items-center justify-between gap-3 py-1.5 first:pt-0 last:pb-0"><span className="min-w-0 truncate">{personName(e.user)}{e.description ? `: ${e.description}` : ''}</span><span className="num shrink-0 text-muted">{e.endedAt ? mins(e.minutes) : 'running'}, {fmtDateTime(e.startedAt)}</span></li>)}</ul></Panel>
          )}
          <RecordPanel entityType="TASK" entityId={t.id} tabs={['comments', 'files']} />
        </>}
      </Sheet>
      {t && <>
        <FormDialog open={dlg === 'edit'} onClose={() => setDlg(null)} title="Edit task" fields={fields} submitLabel="Save changes" initial={{ ...t, dueDate: day(t.dueDate), projectId: t.projectId ?? '', description: t.description ?? '', estimatedMinutes: t.estimatedMinutes ?? '' }} onSubmit={async (v) => { await api(`/tasks/${t.id}`, { method: 'PATCH', body: v }); toast.success('Changes saved'); changed() }} />
        <FormDialog open={dlg === 'time'} onClose={() => setDlg(null)} title="Log time" size="sm" submitLabel="Log time" fields={[{ name: 'minutes', label: 'Minutes worked', type: 'number', required: true, full: true }, { name: 'description', label: 'What was done', full: true }]} onSubmit={async (v) => { await api(`/tasks/${t.id}/time`, { body: v }); toast.success('Time logged'); changed() }} />
        <ConfirmDialog open={dlg === 'delete'} onClose={() => setDlg(null)} title="Delete this task?" confirmLabel="Delete task" danger onConfirm={async () => { await api(`/tasks/${t.id}`, { method: 'DELETE' }); onChanged(); onClose() }}>This cannot be undone.</ConfirmDialog>
      </>}
    </>
  )
}

export default function Tasks() {
  const { lookups, can, scope } = useAuth()
  const ownOnly = scope('TASKS') === 'OWN'
  const [who, setWho] = useState('mine')
  const [view, setView] = useState('board')
  const [openId, setOpenId] = useState<string | null>(null)
  useUrlParam('open', setOpenId)
  useUrlParam('new', () => setAdd(true))
  const [add, setAdd] = useState(false)
  const { data, reload } = useApi<{ items: any[] }>(`/tasks?limit=500${who === 'mine' ? '&mine=1' : ''}`)
  const projects = useApi<{ items: any[] }>(can('PROJECTS') ? '/projects?limit=200' : null).data?.items ?? []
  // finished tasks drop off the board two weeks after completion
  const tasks = (data?.items ?? []).filter((t) => t.status !== 'CANCELLED' && (t.status !== 'DONE' || !t.completedAt || daysFromToday(t.completedAt) > -14))
  const fields: Field[] = [
    { name: 'title', label: 'Task', required: true, full: true }, { name: 'projectId', label: 'Project', type: 'select', options: projects.filter((p) => p.status !== 'COMPLETED').map((p) => ({ value: p.id, label: p.name })), placeholder: 'General, no project' },
    { name: 'assigneeId', label: 'Assign to', type: 'select', options: userOptions(lookups), placeholder: 'Me' }, { name: 'priority', label: 'Priority', type: 'select', options: options(lookups.enums.Priority), required: true },
    { name: 'dueDate', label: 'Due date', type: 'date' }, { name: 'estimatedMinutes', label: 'Estimate (minutes)', type: 'number' }, { name: 'description', label: 'Details', type: 'textarea' },
  ]
  const viewTabs = <Tabs value={view} onChange={setView} options={[{ value: 'board', label: 'Board' }, { value: 'timesheet', label: 'Timesheet' }]} />
  if (view === 'timesheet') return <div className="space-y-3">{viewTabs}<Timesheet projects={projects.filter((p) => p.status !== 'COMPLETED')} /></div>
  return (
    <div className="space-y-3">
      {viewTabs}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {ownOnly ? <p className="text-[13px] text-muted">Tasks assigned to you or added by you. Drag a card to change its status.</p> : <Tabs value={who} onChange={setWho} options={[{ value: 'mine', label: 'Assigned to me' }, { value: 'all', label: 'Everyone' }]} />}
        {can('TASKS', 'CREATE') && <Button variant="primary" onClick={() => setAdd(true)}><Plus size={16} />Add task</Button>}
      </div>
      <Board
        items={tasks} columnOf={(t: any) => t.status} onOpen={(t: any) => setOpenId(t.id)} columns={COLUMNS.map((c) => ({ key: c, label: human(c) }))}
        onMove={can('TASKS', 'EDIT') ? (t: any, to) => act(() => api(`/tasks/${t.id}`, { method: 'PATCH', body: { status: to } })).then(reload) : undefined}
        render={(t: any) => <><div className="font-medium">{t.title}</div><div className="text-xs text-muted">{t.project?.name ?? 'General'}</div><div className="mt-2 flex items-center justify-between gap-2"><Badge tone={prioTone(t.priority)}>{human(t.priority)}</Badge><span className="flex items-center gap-1.5 text-xs">{t.status !== 'DONE' && t.dueDate && <DueTag date={t.dueDate} />}{t.assignee && <Avatar name={personName(t.assignee)} />}</span></div></>}
      />
      {data && !tasks.length && <Card className="px-4 py-8 text-center text-sm text-muted">No tasks here yet. Add one, or create tasks from a project.</Card>}
      <FormDialog open={add} onClose={() => setAdd(false)} title="Add task" fields={fields} submitLabel="Add task" initial={{ priority: 'MEDIUM', dueDate: plusDays(2) }} onSubmit={async (v) => { await api('/tasks', { body: v }); toast.success('Task added'); reload() }} />
      <TaskSheet id={openId} onClose={() => setOpenId(null)} onChanged={reload} fields={fields} />
    </div>
  )
}
