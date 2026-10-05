'use client'
// Payroll: one run per month, a payslip per person, and the payroll settings. Lives in HR as a tab.
import { CheckCheck, FileText, MessageCircle, Pencil, Plus, RefreshCw, Settings2, Trash2, Undo2, Wallet, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog, FormDialog } from '@/components/form'
import { Button, Card, Dialog, Empty, Field, Input, Loading, Panel, StatBand, Status, Table, Td, Textarea, Th, Two } from '@/components/ui'
import { ApiError, api, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { fmtDate, inr, personName, todayStr, waLink } from '@/lib/format'
import { act } from './common'

type Line = { name: string; amount: number | string }
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const lastMonth = () => { const [y, m] = todayStr().split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}` }
const openPayslip = (id: string) => window.open(`/print/payslip/${id}`, '_blank')

/** Rows of name and amount, for bonus lines and deductions. */
function LinesEditor({ label, value, onChange, hint }: { label: string; value: Line[]; onChange: (v: Line[]) => void; hint: string }) {
  return (
    <Field label={label} help={hint} group>
      <div className="space-y-2">
        {value.map((l, i) => (
          <div key={i} className="flex gap-2">
            <Input aria-label={`${label} name`} placeholder="Name" value={l.name} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <Input aria-label={`${label} amount`} type="number" step="any" min={0} className="w-36" placeholder="Amount" value={l.amount} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
            <Button size="icon" variant="ghost" aria-label="Remove line" onClick={() => onChange(value.filter((_, j) => j !== i))}><X size={15} /></Button>
          </div>
        ))}
        <Button size="sm" onClick={() => onChange([...value, { name: '', amount: '' }])}><Plus size={14} />Add a line</Button>
      </div>
    </Field>
  )
}

function EditPayslip({ slip, onClose, onSaved }: { slip: any; onClose: () => void; onSaved: () => void }) {
  const [lop, setLop] = useState('')
  const [extra, setExtra] = useState<Line[]>([])
  const [ded, setDed] = useState<Line[]>([])
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!slip) return
    setLop(String(slip.lopDays)); setExtra(slip.extraEarnings ?? []); setDed(slip.deductions ?? []); setNotes(slip.notes ?? '')
  }, [slip])
  if (!slip) return null
  const clean = (ls: Line[]) => ls.filter((l) => String(l.name).trim() && l.amount !== '').map((l) => ({ name: String(l.name).trim(), amount: Number(l.amount) }))
  const save = async () => {
    setBusy(true)
    try {
      await api(`/payroll/payslips/${slip.id}`, { method: 'PATCH', body: { lopDays: Number(lop || 0), extraEarnings: clean(extra), deductions: clean(ded), notes } })
      toast.success('Payslip updated'); onSaved(); onClose()
    } catch (e) { toast.error(e instanceof ApiError || e instanceof Error ? e.message : 'Could not save') } finally { setBusy(false) }
  }
  return (
    <Dialog open onClose={onClose} title={`Payslip for ${personName(slip.employee)}`} size="lg" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save payslip</Button></>}>
      <div className="space-y-4">
        <Field label="Loss of pay days" help={`Out of ${slip.workingDays} working days. Worked out from unpaid leave and days marked absent. Change it if needed.`}>
          <Input type="number" step="0.5" min={0} max={slip.workingDays} className="w-32" value={lop} onChange={(e) => setLop(e.target.value)} />
        </Field>
        <LinesEditor label="Extra earnings" value={extra} onChange={setExtra} hint="For example a bonus, incentive or overtime." />
        <LinesEditor label="Deductions" value={ded} onChange={setDed} hint="For example a salary advance being paid back. No PF, ESI or TDS is taken automatically." />
        <Field label="Note on the payslip"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Dialog>
  )
}

function PayrollSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, reload } = useApi<any>(open ? '/payroll/settings' : null)
  const [split, setSplit] = useState<Line[]>([])
  const [off, setOff] = useState<number[]>([0])
  const [v, setV] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!data) return
    setSplit(data.split.map((c: any) => ({ name: c.name, amount: c.percent })))
    setOff(data.weeklyOff)
    setV({ payDay: data.payDay ?? '', probationMonths: data.probationMonths ?? '', noticeMonths: String(data.noticeMonths), workHours: data.workHours ?? '', terms: data.terms ?? '' })
  }, [data])
  const total = split.reduce((n, c) => n + Number(c.amount || 0), 0)
  const save = async () => {
    setBusy(true)
    try {
      await api('/payroll/settings', { method: 'PUT', body: { split: split.filter((c) => String(c.name).trim()).map((c) => ({ name: String(c.name).trim(), percent: Number(c.amount || 0) })), weeklyOff: off, payDay: v.payDay || null, probationMonths: v.probationMonths || null, noticeMonths: Number(v.noticeMonths || 0), workHours: v.workHours || null, terms: v.terms || null } })
      toast.success('Payroll settings saved'); reload(); onClose()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save') } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Payroll settings" size="lg" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save settings</Button></>}>
      {!data ? <Loading /> : (
        <div className="space-y-4">
          <LinesEditor label="Salary parts, in % of the monthly salary" value={split} onChange={setSplit} hint={`These add up to ${total}%. They must add up to 100%. Payslips and appointment letters use them.`} />
          <Field label="Weekly off days" group>
            <span className="flex flex-wrap gap-1.5">{WEEKDAYS.map((d, i) => {
              const on = off.includes(i)
              return <button key={d} type="button" aria-pressed={on} onClick={() => setOff(on ? off.filter((x) => x !== i) : [...off, i].sort())} className={`rounded-full border px-2.5 py-1 text-[13px] ${on ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface text-muted hover:text-ink'}`}>{d}</button>
            })}</span>
          </Field>
          <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-3">
            <Field label="Pay day of the month" help="Leave empty if it changes"><Input type="number" min={1} max={31} value={v.payDay} onChange={(e) => setV({ ...v, payDay: e.target.value })} /></Field>
            <Field label="Probation in months" help="Leave empty for none"><Input type="number" min={0} max={24} value={v.probationMonths} onChange={(e) => setV({ ...v, probationMonths: e.target.value })} /></Field>
            <Field label="Notice period in months"><Input type="number" min={0} max={12} value={v.noticeMonths} onChange={(e) => setV({ ...v, noticeMonths: e.target.value })} /></Field>
          </div>
          <Field label="Working hours, as written in the appointment letter" help="For example: Monday to Saturday, 9:30 am to 6:30 pm. Leave empty to leave it out."><Input value={v.workHours} onChange={(e) => setV({ ...v, workHours: e.target.value })} /></Field>
          <Field label="Terms and conditions on the joining form" help="One rule per line. Leave, notice, probation and working hours from above are added at the top for you."><Textarea rows={8} value={v.terms} onChange={(e) => setV({ ...v, terms: e.target.value })} /></Field>
        </div>
      )}
    </Dialog>
  )
}

function RunDetail({ id, onChanged, onDeleted }: { id: string; onChanged: () => void; onDeleted: () => void }) {
  const { can, lookups } = useAuth()
  const { data: run, reload, loading } = useApi<any>(`/payroll/${id}`)
  const [edit, setEdit] = useState<any>(null)
  const [confirm, setConfirm] = useState<'' | 'finalise' | 'delete'>('')
  const [paid, setPaid] = useState(false)
  if (!run) return loading ? <Card><Loading /></Card> : null
  const draft = run.status === 'DRAFT'
  const done = () => { reload(); onChanged() }
  const post = (path: string, msg: string, body: any = {}) => act(() => api(`/payroll/${id}/${path}`, { body }), msg).then((ok) => ok && done())
  const company = lookups.organization?.name ?? ''
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg font-semibold">{run.monthName}</h2><Status value={run.status} />
        {run.paidOn && <span className="text-[13px] text-muted">Paid on {fmtDate(run.paidOn)}</span>}
        <div className="flex-1" />
        {draft && can('HR', 'EDIT') && <Button onClick={() => post('recalculate', 'Payslips worked out again')}><RefreshCw size={15} />Recalculate</Button>}
        {draft && can('HR', 'DELETE') && <Button variant="ghost" onClick={() => setConfirm('delete')}><Trash2 size={15} />Delete</Button>}
        {draft && can('HR', 'APPROVE') && <Button variant="primary" onClick={() => setConfirm('finalise')}><CheckCheck size={15} />Finalise and share payslips</Button>}
        {run.status === 'FINALISED' && can('HR', 'APPROVE') && <><Button onClick={() => post('reopen', 'Payroll reopened for changes')}><Undo2 size={15} />Reopen</Button><Button variant="primary" onClick={() => setPaid(true)}><Wallet size={15} />Mark as paid</Button></>}
      </div>
      <StatBand items={[{ label: 'People', value: run.payslips.length }, { label: 'Working days', value: run.workingDays }, { label: 'Gross pay', value: inr(run.totalGross) }, { label: 'Deductions', value: inr(run.totalDeductions) }, { label: 'Net pay to send', value: inr(run.totalNet) }]} />
      <Card className="overflow-x-auto">
        {!run.payslips.length ? <Empty>No one is in this payroll. Add a yearly salary to each employee on the Employees tab, then press Recalculate.</Empty> : (
          <Table>
            <thead><tr><Th>Employee</Th><Th right>Work days</Th><Th right>Loss of pay</Th><Th right>Paid days</Th><Th right>Gross</Th><Th right>Deductions</Th><Th right>Net pay</Th><Th /></tr></thead>
            <tbody>{run.payslips.map((p: any) => (
              <tr key={p.id}>
                <Td><Two top={personName(p.employee)} bottom={<><span className="num">{p.employee.employeeCode}</span>, {p.employee.designation}</>} /></Td>
                <Td right>{p.workingDays}</Td><Td right className={p.lopDays > 0 ? 'text-bad' : 'text-muted'}>{p.lopDays}</Td><Td right>{p.paidDays}</Td>
                <Td right>{inr(p.gross)}</Td><Td right className="text-muted">{p.totalDeductions ? inr(p.totalDeductions) : ''}</Td><Td right className="font-semibold">{inr(p.netPay)}</Td>
                <Td><div className="flex justify-end gap-1">
                  {draft && can('HR', 'EDIT') && <Button size="icon" variant="ghost" aria-label={`Edit payslip of ${personName(p.employee)}`} onClick={() => setEdit(p)}><Pencil size={15} /></Button>}
                  <Button size="icon" variant="ghost" aria-label={`Open payslip of ${personName(p.employee)}`} onClick={() => openPayslip(p.id)}><FileText size={15} /></Button>
                  {!draft && p.employee.phone && <a aria-label={`Send payslip to ${personName(p.employee)} on WhatsApp`} className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink" target="_blank" rel="noreferrer"
                    href={waLink(p.employee.phone, `Hi ${p.employee.firstName}, your payslip for ${run.monthName} from ${company} is ready. Net pay: ${inr(p.netPay)}. You can see and download it here: ${location.origin}/print/payslip/${p.id}`)}><MessageCircle size={15} /></a>}
                </div></Td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
      <p className="text-xs text-muted">Pay is the yearly salary divided by 12, less loss of pay for unpaid leave and days marked absent. People who joined or left during the month are paid for their days only. Once finalised, each person sees their payslip under My profile.</p>
      <EditPayslip slip={edit} onClose={() => setEdit(null)} onSaved={done} />
      <ConfirmDialog open={confirm === 'finalise'} onClose={() => setConfirm('')} title={`Finalise payroll for ${run.monthName}?`} confirmLabel="Finalise" onConfirm={async () => { await api(`/payroll/${id}/finalise`, { body: {} }); toast.success('Payroll finalised. Everyone can now see their payslip.'); done() }}>
        Everyone in it will be told their payslip is ready, and can see it under My profile. You can reopen it until it is marked as paid.
      </ConfirmDialog>
      <ConfirmDialog danger open={confirm === 'delete'} onClose={() => setConfirm('')} title={`Delete the ${run.monthName} draft?`} confirmLabel="Delete" onConfirm={async () => { await api(`/payroll/${id}`, { method: 'DELETE' }); toast.success('Draft deleted'); onDeleted() }}>
        The draft payslips and any changes you made to them are removed. You can start the month again.
      </ConfirmDialog>
      <FormDialog open={paid} onClose={() => setPaid(false)} title="Mark payroll as paid" submitLabel="Mark as paid" initial={{ paidOn: todayStr() }}
        fields={[{ name: 'paidOn', label: 'Salaries sent on', type: 'date', required: true }]}
        onSubmit={async (v) => { await api(`/payroll/${id}/paid`, { body: v }); toast.success('Payroll marked as paid'); done() }} />
    </div>
  )
}

export default function Payroll() {
  const { can } = useAuth()
  const { data, reload, loading } = useApi<{ items: any[] }>('/payroll')
  const [sel, setSel] = useState<string | null>(null)
  const [start, setStart] = useState(false)
  const [settings, setSettings] = useState(false)
  const current = sel ?? data?.items[0]?.id ?? null
  return (
    <div className="grid gap-4 xl:grid-cols-[230px_1fr]">
      <div className="space-y-3">
        <div className="flex gap-2">
          {can('HR', 'CREATE') && <Button variant="primary" className="flex-1" onClick={() => setStart(true)}><Plus size={16} />Run payroll</Button>}
          {can('HR', 'EDIT') && <Button size="icon" aria-label="Payroll settings" onClick={() => setSettings(true)}><Settings2 size={16} /></Button>}
        </div>
        <Panel title="Months" flush>
          {!data && loading ? <Loading /> : !data?.items.length ? <Empty>No payroll yet. Press Run payroll and pick a month.</Empty> : (
            <ul className="divide-y divide-line">{data.items.map((r) => (
              <li key={r.id}><button type="button" onClick={() => setSel(r.id)} aria-current={r.id === current} className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-surface-2/60 ${r.id === current ? 'bg-accent-soft/60' : ''}`}>
                <Two top={<span className="font-medium">{r.monthName}</span>} bottom={`${r.people} people, ${inr(r.totalNet)}`} /><Status value={r.status} />
              </button></li>
            ))}</ul>
          )}
        </Panel>
      </div>
      <div className="min-w-0">{current ? <RunDetail key={current} id={current} onChanged={reload} onDeleted={() => { setSel(null); reload() }} /> : <Card><Empty>Pick a month on the left, or run payroll for a new month.</Empty></Card>}</div>
      <FormDialog open={start} onClose={() => setStart(false)} title="Run payroll" submitLabel="Work out payslips" initial={{ month: lastMonth() }}
        intro={<p className="text-sm text-muted">Payslips are worked out from each person&apos;s yearly salary, holidays, unpaid leave and days marked absent. You can check and change them before you finalise.</p>}
        fields={[{ name: 'month', label: 'Month', type: 'month', required: true }]}
        onSubmit={async (v) => {
          const r = await api<any>('/payroll', { body: v })
          if (r.skipped?.length) toast.warning(`No salary is set for ${r.skipped.join(', ')}, so they are left out.`)
          else toast.success(`Payslips worked out for ${r.monthName}`)
          setSel(r.id); reload()
        }} />
      <PayrollSettings open={settings} onClose={() => setSettings(false)} />
    </div>
  )
}

/** The signed-in person's own payslips, for My profile. */
export function MyPayslips() {
  const { data } = useApi<{ items: any[] }>('/me/payslips')
  return (
    <Panel title="My payslips" flush>
      {!data ? <Loading /> : !data.items.length ? <Empty>No payslips yet. They appear here once HR finalises the month&apos;s payroll.</Empty> : (
        <Table>
          <thead><tr><Th>Month</Th><Th right>Gross</Th><Th right>Net pay</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>{data.items.map((p) => (
            <tr key={p.id}>
              <Td className="font-medium">{p.monthName}</Td><Td right>{inr(p.gross)}</Td><Td right className="font-semibold">{inr(p.netPay)}</Td>
              <Td>{p.run.status === 'PAID' ? <Status value="PAID" label={`Paid ${fmtDate(p.run.paidOn)}`} /> : <Status value="FINALISED" label="Ready" />}</Td>
              <Td><div className="flex justify-end"><Button size="sm" onClick={() => openPayslip(p.id)}><FileText size={14} />Open</Button></div></Td>
            </tr>
          ))}</tbody>
        </Table>
      )}
    </Panel>
  )
}
