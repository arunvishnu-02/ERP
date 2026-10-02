'use client'
import { History, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { FormDialog } from '@/components/form'
import { Resource } from '@/components/resource'
import { Button, Dialog, Loading, Status, Two } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { day, fmtDate, human, inr, options, personName, todayStr } from '@/lib/format'
import { ExpiryTag } from './common'

function HistoryDialog({ asset, onClose }: { asset: any; onClose: () => void }) {
  const { can } = useAuth()
  const { data, reload } = useApi<{ assignments: any[]; maintenance: any[] }>(asset ? `/assets/${asset.id}/history` : null)
  const [add, setAdd] = useState(false)
  return (
    <>
      <Dialog open={!!asset && !add} onClose={onClose} title={asset ? `${asset.name}, ${asset.assetTag}` : ''} size="lg" footer={can('ASSETS', 'EDIT') ? <Button onClick={() => setAdd(true)}><Plus size={15} />Add maintenance record</Button> : undefined}>
        {!data ? <Loading /> : (
          <div className="grid gap-6 sm:grid-cols-2">
            <section>
              <h3 className="mb-2 font-display text-[15px] font-semibold">Who has had it</h3>
              {!data.assignments.length && <p className="text-sm text-muted">Never assigned.</p>}
              <ul className="space-y-2.5 text-sm">{data.assignments.map((a) => (
                <li key={a.id}><div className="font-medium">{personName(a.employee)}</div><div className="text-xs text-muted">{fmtDate(a.assignedAt)} to {a.returnedAt ? fmtDate(a.returnedAt) : 'now'}{a.conditionOnAssign ? `. Given: ${a.conditionOnAssign}` : ''}{a.conditionOnReturn ? `. Returned: ${a.conditionOnReturn}` : ''}</div></li>
              ))}</ul>
            </section>
            <section>
              <h3 className="mb-2 font-display text-[15px] font-semibold">Maintenance</h3>
              {!data.maintenance.length && <p className="text-sm text-muted">No repairs or servicing recorded.</p>}
              <ul className="space-y-2.5 text-sm">{data.maintenance.map((m) => (
                <li key={m.id}><div className="font-medium">{m.type}: {m.description}</div><div className="text-xs text-muted">{fmtDate(m.performedAt)}{m.vendorName ? `, ${m.vendorName}` : ''}{m.cost ? `, ${inr(m.cost)}` : ''}{m.nextDueAt ? `. Next due ${fmtDate(m.nextDueAt)}` : ''}</div></li>
              ))}</ul>
            </section>
          </div>
        )}
      </Dialog>
      <FormDialog open={add} onClose={() => setAdd(false)} title="Add maintenance record" submitLabel="Add record" initial={{ type: 'Service', performedAt: todayStr() }}
        fields={[{ name: 'type', label: 'Kind', type: 'select', options: ['Repair', 'Service', 'Upgrade'].map((v) => ({ value: v, label: v })), required: true }, { name: 'performedAt', label: 'Done on', type: 'date', required: true }, { name: 'description', label: 'What was done', required: true, full: true }, { name: 'vendorName', label: 'Done by' }, { name: 'cost', label: 'Cost (₹)', type: 'number' }, { name: 'nextDueAt', label: 'Next due', type: 'date' }]}
        onSubmit={async (v) => { await api(`/assets/${asset.id}/maintenance`, { body: v }); toast.success('Maintenance record added'); reload() }} />
    </>
  )
}

export default function Assets() {
  const { lookups, can } = useAuth()
  const [assign, setAssign] = useState<{ row: any; reload: () => void } | null>(null)
  const [ret, setRet] = useState<{ row: any; reload: () => void } | null>(null)
  const [history, setHistory] = useState<any>(null)
  const employees = lookups.employees.filter((e: any) => e.status !== 'EXITED').map((e: any) => ({ value: e.id, label: e.name }))
  return (
    <>
      <Resource path="/assets" module="ASSETS" noun="asset" search="Search name, tag or serial number" exportName="assets" defaults={{ category: 'LAPTOP', status: 'AVAILABLE' }}
        empty="No assets yet. Add laptops, phones, cameras and software licences the company owns."
        filter={{ param: 'status', options: [{ value: '', label: 'All' }, ...options(lookups.enums.AssetStatus)] }}
        toForm={(r) => ({ ...r, purchaseDate: day(r.purchaseDate), warrantyExpiresAt: day(r.warrantyExpiresAt), serialNumber: r.serialNumber ?? '', vendorName: r.vendorName ?? '', purchaseCost: r.purchaseCost ?? '', condition: r.condition ?? '', notes: r.notes ?? '' })}
        fields={[{ name: 'name', label: 'Asset', required: true, placeholder: 'MacBook Air M3' }, { name: 'category', label: 'Category', type: 'select', options: options(lookups.enums.AssetCategory), required: true }, { name: 'serialNumber', label: 'Serial number' }, { name: 'vendorName', label: 'Bought from' }, { name: 'purchaseDate', label: 'Bought on', type: 'date' }, { name: 'purchaseCost', label: 'Cost (₹)', type: 'number' }, { name: 'warrantyExpiresAt', label: 'Warranty until', type: 'date' }, { name: 'condition', label: 'Condition', placeholder: 'New, good, needs repair' }, { name: 'status', label: 'Status', type: 'select', options: options(lookups.enums.AssetStatus).filter((o) => o.value !== 'ASSIGNED') , show: (v) => v.status !== 'ASSIGNED' }, { name: 'notes', label: 'Notes', type: 'textarea' }]}
        rowActions={(r, ctx) => (
          <>
            {can('ASSETS', 'EDIT') && (r.status === 'ASSIGNED' ? <Button size="sm" onClick={() => setRet({ row: r, reload: ctx.reload })}>Return</Button> : ['AVAILABLE'].includes(r.status) ? <Button size="sm" onClick={() => setAssign({ row: r, reload: ctx.reload })}>Assign</Button> : null)}
            <Button size="icon" variant="ghost" aria-label="History and maintenance" onClick={() => setHistory(r)}><History size={15} /></Button>
          </>
        )}
        columns={[
          { header: 'Asset', cell: (r) => <Two top={r.name} bottom={<><span className="num">{r.assetTag}</span>, {human(r.category)}</>} />, text: (r) => r.name }, { header: 'Tag', exportOnly: true, cell: () => null, text: (r) => r.assetTag }, { header: 'Category', exportOnly: true, cell: () => null, text: (r) => human(r.category) },
          { header: 'Serial number', cell: (r) => <span className="num text-muted">{r.serialNumber}</span>, text: (r) => r.serialNumber }, { header: 'With', cell: (r) => (r.assignments[0] ? personName(r.assignments[0].employee) : <span className="text-muted">In office</span>), text: (r) => personName(r.assignments[0]?.employee) },
          { header: 'Cost', right: true, cell: (r) => inr(r.purchaseCost), text: (r) => r.purchaseCost }, { header: 'Warranty', cell: (r) => (r.warrantyExpiresAt ? <ExpiryTag date={r.warrantyExpiresAt} /> : null), text: (r) => day(r.warrantyExpiresAt) }, { header: 'Status', cell: (r) => <Status value={r.status} />, text: (r) => human(r.status) },
        ]} />
      <FormDialog open={!!assign} onClose={() => setAssign(null)} title={`Assign ${assign?.row.name ?? ''}`} submitLabel="Assign" size="sm"
        fields={[{ name: 'employeeId', label: 'Give to', type: 'select', options: employees, required: true, full: true }, { name: 'conditionOnAssign', label: 'Condition when given', full: true }]}
        onSubmit={async (v) => { await api(`/assets/${assign!.row.id}/assign`, { body: v }); toast.success('Asset assigned'); assign!.reload() }} />
      <FormDialog open={!!ret} onClose={() => setRet(null)} title={`Return ${ret?.row.name ?? ''}`} submitLabel="Mark returned" size="sm"
        fields={[{ name: 'conditionOnReturn', label: 'Condition when returned', full: true }]}
        onSubmit={async (v) => { await api(`/assets/${ret!.row.id}/return`, { body: v }); toast.success('Asset returned'); ret!.reload() }} />
      <HistoryDialog asset={history} onClose={() => setHistory(null)} />
    </>
  )
}
