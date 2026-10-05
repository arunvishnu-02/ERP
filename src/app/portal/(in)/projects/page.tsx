'use client'
import { Check } from 'lucide-react'
import { PageTitle } from '@/components/portal'
import { Card, Empty, Loading, Status, cn } from '@/components/ui'
import { useApi } from '@/lib/api'
import { fmtDate, personName } from '@/lib/format'

export default function PortalProjects() {
  const { data } = useApi<{ items: any[] }>('/portal/projects')
  if (!data) return <Loading />
  return (
    <>
      <PageTitle title="Projects" intro="Where each project stands, and what comes next." />
      {!data.items.length && <Card><Empty>No projects yet.</Empty></Card>}
      <div className="space-y-4">
        {data.items.map((p) => (
          <Card key={p.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><h2 className="font-display text-lg font-semibold">{p.name}</h2><p className="text-xs text-muted"><span className="num">{p.projectNumber}</span>{p.manager ? `, managed by ${personName(p.manager)}` : ''}{p.dueDate && !p.completedAt ? `, target ${fmtDate(p.dueDate)}` : ''}{p.completedAt ? `, finished ${fmtDate(p.completedAt)}` : ''}</p></div>
              <Status value={p.status} />
            </div>
            {p.description && <p className="mt-2 text-sm whitespace-pre-wrap text-muted">{p.description}</p>}
            <div className="mt-3 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${p.progressPercent}%` }} /></div><span className="num text-sm font-medium">{p.progressPercent}%</span></div>
            {!!p.milestones.length && (
              <ol className="mt-4 space-y-2">
                {p.milestones.map((m: any) => {
                  const done = ['COMPLETED', 'INVOICED'].includes(m.status)
                  return (
                    <li key={m.id} className="flex items-center gap-3 text-sm">
                      <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full border', done ? 'border-accent bg-accent text-accent-ink' : m.status === 'IN_PROGRESS' ? 'border-accent text-accent' : 'border-line text-muted')}>{done ? <Check size={13} /> : null}</span>
                      <span className={cn('flex-1', done && 'text-muted')}>{m.name}</span>
                      <span className="text-xs text-muted">{done ? (m.completedAt ? `Done ${fmtDate(m.completedAt)}` : 'Done') : m.status === 'IN_PROGRESS' ? 'In progress' : m.dueDate ? `By ${fmtDate(m.dueDate)}` : ''}</span>
                    </li>
                  )
                })}
              </ol>
            )}
          </Card>
        ))}
      </div>
    </>
  )
}
