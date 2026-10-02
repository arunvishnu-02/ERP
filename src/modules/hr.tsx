'use client'
// Employees, attendance, leave, holidays and performance reviews.
import { Check, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { FormDialog } from '@/components/form'
import { Resource } from '@/components/resource'
import { Button, Card, Chips, Empty, Input, Loading, Select, Status, Table, Tabs, Td, Th, Two } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { day, fmtDate, fmtDateTime, human, inr, options, personName, todayStr } from '@/lib/format'
import { act } from './common'

const employeeOptions = (lookups: any) => lookups.employees.filter((e: any) => e.status !== 'EXITED').map((e: any) => ({ value: e.id, label: e.name }))

function Employees() {
  const { lookups, reloadLookups } = useAuth()
  const depts = lookups.departments.map((d: any) => ({ value: d.id, label: d.name }))
  return (
    <>
      <Resource path="/hr/employees" module="HR" noun="employee" search="Search name, code or designation" exportName="employees" afterSave={reloadLookups}
        defaults={{ employmentType: 'FULL_TIME', status: 'ACTIVE', dateOfJoining: todayStr() }}
        filter={{ param: 'status', options: [{ value: '', label: 'All' }, ...options(lookups.enums.EmployeeStatus)] }}
        toForm={(r) => ({ ...r, lastName: r.lastName ?? '', dateOfJoining: day(r.dateOfJoining), dateOfBirth: day(r.dateOfBirth), exitDate: day(r.exitDate), departmentId: r.departmentId ?? '', reportingManagerId: r.reportingManagerId ?? '', phone: r.phone ?? '', personalEmail: r.personalEmail ?? '', address: r.address ?? '', ctcAnnual: r.ctcAnnual ?? '' })}
        fields={[
          { name: 'firstName', label: 'First name', required: true }, { name: 'lastName', label: 'Last name' }, { name: 'designation', label: 'Designation', required: true },
          { name: 'departmentId', label: 'Department', type: 'select', options: depts }, { name: 'employmentType', label: 'Employment type', type: 'select', options: options(lookups.enums.EmploymentType) },
          { name: 'reportingManagerId', label: 'Reports to', type: 'select', options: employeeOptions(lookups) }, { name: 'dateOfJoining', label: 'Joined on', type: 'date', required: true }, { name: 'dateOfBirth', label: 'Date of birth', type: 'date' },
          { name: 'phone', label: 'Phone' }, { name: 'personalEmail', label: 'Personal email', type: 'email' }, { name: 'ctcAnnual', label: 'Salary per year (₹)', type: 'number' },
          { name: 'status', label: 'Status', type: 'select', options: options(lookups.enums.EmployeeStatus) }, { name: 'exitDate', label: 'Last working day', type: 'date', show: (v) => v.status !== 'ACTIVE' }, { name: 'address', label: 'Address', type: 'textarea' },
        ]}
        columns={[
          { header: 'Employee', cell: (r) => <Two top={personName(r)} bottom={<><span className="num">{r.employeeCode}</span>, {r.designation}</>} />, text: (r) => personName(r) },
          { header: 'Code', exportOnly: true, cell: () => null, text: (r) => r.employeeCode }, { header: 'Designation', exportOnly: true, cell: () => null, text: (r) => r.designation },
          { header: 'Department', cell: (r) => r.department?.name, text: (r) => r.department?.name }, { header: 'Type', cell: (r) => human(r.employmentType), text: (r) => human(r.employmentType) },
          { header: 'Joined', cell: (r) => <span className="text-muted">{fmtDate(r.dateOfJoining)}</span>, text: (r) => day(r.dateOfJoining) }, { header: 'Phone', cell: (r) => <span className="num">{r.phone}</span>, text: (r) => r.phone },
          { header: 'Login', cell: (r) => (r.user ? <span className="text-muted">{r.user.email}</span> : <span className="text-muted">No login</span>), text: (r) => r.user?.email },
          { header: 'Salary', right: true, cell: (r) => inr(r.ctcAnnual), text: (r) => r.ctcAnnual }, { header: 'Status', cell: (r) => <Status value={r.status} />, text: (r) => human(r.status) },
        ]} />
      <p className="mt-3 text-xs text-muted">An employee added here has no login. To give someone a login, add them under Settings, Users. That creates their employee profile too.</p>
    </>
  )
}

function Attendance() {
  const { lookups, can } = useAuth()
  const [date, setDate] = useState(todayStr())
  const { data, reload, loading } = useApi<{ items: any[] }>(`/hr/attendance?date=${date}`)
  const month = useApi<{ items: any[] }>(`/hr/attendance/month?month=${date.slice(0, 7)}`)
  const count = (id: string, ...statuses: string[]) => month.data?.items.filter((x) => x.employeeId === id && statuses.includes(x.status)).reduce((n, x) => n + x.days, 0) ?? 0
  const mark = async (employeeId: string, status: string) => {
    if (await act(() => api('/hr/attendance', { method: 'PUT', body: { employeeId, date, status } }))) { reload(); month.reload() }
  }
  const edit = can('HR', 'EDIT')
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[13px] text-muted">Date<Input type="date" className="w-40" value={date} max={todayStr()} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
        <div className="flex-1" />
        {edit && !!data?.items.length && <Button onClick={async () => { for (const e of data.items) if (!e.attendance) await api('/hr/attendance', { method: 'PUT', body: { employeeId: e.id, date, status: 'PRESENT' } }).catch(() => {}); toast.success('Unmarked people set to present'); reload(); month.reload() }}>Mark the rest present</Button>}
      </div>
      <Card className="overflow-hidden">
        {!data && loading ? <Loading /> : !data?.items.length ? <Empty>No employees yet.</Empty> : (
          <Table>
            <thead><tr><Th>Employee</Th><Th>Status on {fmtDate(date)}</Th><Th>In</Th><Th>Out</Th><Th right>Hours</Th><Th right>Present this month</Th><Th right>Leave</Th><Th right>Absent</Th></tr></thead>
            <tbody>{data.items.map((e) => {
              const a = e.attendance
              return (
                <tr key={e.id}>
                  <Td><Two top={personName(e)} bottom={[e.designation, e.department?.name].filter(Boolean).join(', ')} /></Td>
                  <Td>{edit ? (
                    <Select className="w-44" aria-label={`Attendance for ${personName(e)}`} value={a?.status ?? ''} onChange={(ev) => ev.target.value && mark(e.id, ev.target.value)}>
                      <option value="">Not marked</option>{options(lookups.enums.AttendanceStatus).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  ) : a ? <Status value={a.status} /> : <span className="text-muted">Not marked</span>}</Td>
                  <Td className="num text-muted">{a?.checkInAt ? fmtDateTime(a.checkInAt).split(', ').pop() : ''}</Td><Td className="num text-muted">{a?.checkOutAt ? fmtDateTime(a.checkOutAt).split(', ').pop() : ''}</Td>
                  <Td right>{a?.workMinutes ? (a.workMinutes / 60).toFixed(1) : ''}</Td>
                  <Td right>{count(e.id, 'PRESENT', 'WORK_FROM_HOME') + count(e.id, 'HALF_DAY') / 2}</Td><Td right>{count(e.id, 'ON_LEAVE')}</Td><Td right>{count(e.id, 'ABSENT')}</Td>
                </tr>
              )
            })}</tbody>
          </Table>
        )}
      </Card>
      <p className="text-xs text-muted">People check in and out themselves from the dashboard. HR can correct any day here. A half day counts as half.</p>
    </div>
  )
}

function Leave() {
  const { lookups, can } = useAuth()
  const [status, setStatus] = useState('PENDING')
  const { data, reload, loading } = useApi<{ items: any[] }>(`/hr/leave-requests?limit=100${status ? `&status=${status}` : ''}`)
  const [add, setAdd] = useState(false)
  const decide = async (id: string, decision: 'approve' | 'reject') => { if (await act(() => api(`/hr/leave-requests/${id}/${decision}`, { body: {} }), decision === 'approve' ? 'Leave approved' : 'Leave rejected')) reload() }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Chips value={status} onChange={setStatus} options={[{ value: 'PENDING', label: 'Waiting' }, { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Rejected' }, { value: '', label: 'All' }]} />
        {can('HR', 'CREATE') && <Button variant="primary" onClick={() => setAdd(true)}><Plus size={16} />Add leave request</Button>}
      </div>
      <Card className="overflow-hidden">
        {!data && loading ? <Loading /> : !data?.items.length ? <Empty>{status === 'PENDING' ? 'No leave requests are waiting.' : 'No leave requests here.'}</Empty> : (
          <Table>
            <thead><tr><Th>Employee</Th><Th>Leave</Th><Th>Dates</Th><Th right>Days</Th><Th>Reason</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>{data.items.map((r) => (
              <tr key={r.id}>
                <Td className="font-medium">{personName(r.employee)}</Td><Td>{r.leaveType.name}</Td>
                <Td className="whitespace-nowrap text-muted">{fmtDate(r.startDate)}{day(r.endDate) !== day(r.startDate) ? ` to ${fmtDate(r.endDate)}` : ''}</Td><Td right>{r.days}</Td>
                <Td className="max-w-64 text-muted">{r.reason}</Td><Td><Two top={<Status value={r.status} />} bottom={r.approver ? `by ${personName(r.approver)}` : undefined} /></Td>
                <Td>{r.status === 'PENDING' && can('HR', 'APPROVE') && <div className="flex justify-end gap-1"><Button size="sm" variant="primary" onClick={() => decide(r.id, 'approve')}><Check size={14} />Approve</Button><Button size="sm" onClick={() => decide(r.id, 'reject')}><X size={14} />Reject</Button></div>}</Td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
      <p className="text-xs text-muted">Approved leave is marked on the attendance sheet automatically. People send their own requests from My profile.</p>
      <FormDialog open={add} onClose={() => setAdd(false)} title="Add leave request" submitLabel="Add request" initial={{ startDate: todayStr(), endDate: todayStr() }}
        fields={[{ name: 'employeeId', label: 'Employee', type: 'select', options: employeeOptions(lookups), required: true }, { name: 'leaveTypeId', label: 'Leave type', type: 'select', options: lookups.leaveTypes.map((t: any) => ({ value: t.id, label: t.name })), required: true }, { name: 'startDate', label: 'From', type: 'date', required: true }, { name: 'endDate', label: 'To', type: 'date', required: true }, { name: 'reason', label: 'Reason', type: 'textarea' }]}
        onSubmit={async (v) => { await api('/hr/leave-requests', { body: v }); toast.success('Leave request added'); setStatus('PENDING'); reload() }} />
    </div>
  )
}

export default function HR() {
  const { lookups, reloadLookups } = useAuth()
  const [tab, setTab] = useState('employees')
  return (
    <div className="space-y-3">
      <Tabs value={tab} onChange={setTab} options={[{ value: 'employees', label: 'Employees' }, { value: 'attendance', label: 'Attendance' }, { value: 'leave', label: 'Leave requests' }, { value: 'holidays', label: 'Holidays' }, { value: 'reviews', label: 'Performance reviews' }, { value: 'types', label: 'Leave types' }]} />
      {tab === 'employees' && <Employees />}
      {tab === 'attendance' && <Attendance />}
      {tab === 'leave' && <Leave />}
      {tab === 'holidays' && (
        <Resource path="/hr/holidays" module="HR" noun="holiday" defaults={{ date: todayStr() }} empty="No holidays yet. Add the days the office is closed this year."
          fields={[{ name: 'name', label: 'Holiday', required: true }, { name: 'date', label: 'Date', type: 'date', required: true }, { name: 'isOptional', label: 'Optional', type: 'checkbox', placeholder: 'People can choose to take it' }]}
          columns={[{ header: 'Holiday', cell: (r) => <span className="font-medium">{r.name}</span> }, { header: 'Date', cell: (r) => fmtDate(r.date) }, { header: 'Day', cell: (r) => <span className="text-muted">{new Date(`${day(r.date)}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long' })}</span> }, { header: 'Kind', cell: (r) => (r.isOptional ? 'Optional' : 'Office closed') }]} />
      )}
      {tab === 'reviews' && (
        <Resource path="/hr/reviews" module="HR" noun="review" defaults={{ status: 'DRAFT', periodEnd: todayStr() }}
          toForm={(r) => ({ ...r, periodStart: day(r.periodStart), periodEnd: day(r.periodEnd), rating: r.rating ?? '', strengths: r.strengths ?? '', improvements: r.improvements ?? '' })}
          fields={[{ name: 'employeeId', label: 'Employee', type: 'select', options: employeeOptions(lookups), required: true }, { name: 'status', label: 'Status', type: 'select', options: options(lookups.enums.ReviewStatus) }, { name: 'periodStart', label: 'Period from', type: 'date', required: true }, { name: 'periodEnd', label: 'Period to', type: 'date', required: true }, { name: 'rating', label: 'Rating out of 5', type: 'number' }, { name: 'strengths', label: 'What went well', type: 'textarea' }, { name: 'improvements', label: 'What to improve', type: 'textarea' }]}
          columns={[{ header: 'Employee', cell: (r) => <Two top={personName(r.employee)} bottom={r.employee.designation} /> }, { header: 'Period', cell: (r) => <span className="text-muted">{fmtDate(r.periodStart)} to {fmtDate(r.periodEnd)}</span> }, { header: 'Rating', right: true, cell: (r) => (r.rating ? `${r.rating} / 5` : '') }, { header: 'Reviewer', cell: (r) => personName(r.reviewer) }, { header: 'Status', cell: (r) => <Status value={r.status} /> }]} />
      )}
      {tab === 'types' && (
        <Resource path="/hr/leave-types" module="HR" noun="leave type" afterSave={reloadLookups} defaults={{ isPaid: true, annualQuota: 12 }}
          fields={[{ name: 'name', label: 'Name', required: true }, { name: 'code', label: 'Short code', required: true, placeholder: 'CL' }, { name: 'annualQuota', label: 'Days per year', type: 'number' }, { name: 'isPaid', label: 'Paid', type: 'checkbox', placeholder: 'Paid leave' }, { name: 'carryForward', label: 'Carry forward', type: 'checkbox', placeholder: 'Unused days move to next year' }]}
          columns={[{ header: 'Leave type', cell: (r) => <span className="font-medium">{r.name}</span> }, { header: 'Code', cell: (r) => <span className="num">{r.code}</span> }, { header: 'Days per year', right: true, cell: (r) => r.annualQuota }, { header: 'Paid', cell: (r) => (r.isPaid ? 'Yes' : 'No') }, { header: 'Carry forward', cell: (r) => (r.carryForward ? 'Yes' : 'No') }]} />
      )}
    </div>
  )
}
