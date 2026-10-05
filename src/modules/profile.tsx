'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { FormDialog, InlineForm } from '@/components/form'
import { Badge, Button, Card, Empty, KV, Loading, Panel, Progress, Status, Table, Td, Th } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { day, fmtDate, fmtDateTime, todayStr } from '@/lib/format'
import { act } from './common'
import { MyPayslips } from './payroll'

export default function Profile() {
  const { me } = useAuth()
  const { data, reload } = useApi<any>('/me/hr')
  const [leave, setLeave] = useState(false)
  const [pwKey, setPwKey] = useState(0)
  if (!data) return <Loading />
  const e = data.employee
  const a = data.attendance
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title={me.name}>
        <KV rows={[['Email', me.email], ['Roles', <span key="r" className="flex flex-wrap gap-1">{me.roles.map((r) => <Badge key={r.id}>{r.name}</Badge>)}</span>], ['Employee code', e && <span className="num">{e.employeeCode}</span>], ['Designation', e?.designation], ['Department', e?.department?.name], ['Joined', e && fmtDate(e.dateOfJoining)]]} />
        {!e && <p className="mt-3 text-sm text-muted">No employee profile is linked to your login, so attendance and leave are not available. Ask HR to add one.</p>}
      </Panel>
      {e && (
        <Panel title="Attendance today">
          {a?.checkInAt ? (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span>Checked in at {fmtDateTime(a.checkInAt)}{a.checkOutAt ? `, out at ${fmtDateTime(a.checkOutAt)}` : ''}{a.status === 'WORK_FROM_HOME' ? ' (working from home)' : ''}</span>
              {!a.checkOutAt && <Button onClick={() => act(() => api('/me/check-out', { body: {} }), 'Checked out').then(reload)}>Check out</Button>}
            </div>
          ) : a ? <p className="text-sm">Marked <Status value={a.status} /> by HR.</p> : (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={() => act(() => api('/me/check-in', { body: {} }), 'Checked in').then(reload)}>Check in</Button>
              <Button onClick={() => act(() => api('/me/check-in', { body: { workFromHome: true } }), 'Checked in from home').then(reload)}>Check in from home</Button>
            </div>
          )}
        </Panel>
      )}
      {e && (
        <Panel title="Leave this year" action={<Button size="sm" variant="primary" onClick={() => setLeave(true)}>Ask for leave</Button>}>
          <div className="space-y-3">
            {data.leaveTypes.map((t: any) => (
              <div key={t.id} className="text-sm">
                <div className="mb-1 flex justify-between gap-2"><span>{t.name}</span><span className="num text-muted">{t.used} of {t.annualQuota} days used</span></div>
                <Progress value={t.annualQuota ? (t.used / t.annualQuota) * 100 : 0} hot={t.used > t.annualQuota} />
              </div>
            ))}
          </div>
        </Panel>
      )}
      {e && (
        <Panel title="My leave requests" flush>
          {!data.leaveRequests.length ? <Empty>You have not asked for leave yet.</Empty> : (
            <Table>
              <thead><tr><Th>Leave</Th><Th>Dates</Th><Th right>Days</Th><Th>Status</Th></tr></thead>
              <tbody>{data.leaveRequests.map((r: any) => <tr key={r.id}><Td>{r.leaveType.name}</Td><Td className="whitespace-nowrap text-muted">{fmtDate(r.startDate)}{day(r.endDate) !== day(r.startDate) ? ` to ${fmtDate(r.endDate)}` : ''}</Td><Td right>{r.days}</Td><Td><Status value={r.status} /></Td></tr>)}</tbody>
            </Table>
          )}
        </Panel>
      )}
      {e && <MyPayslips />}
      <Card className="p-4 lg:col-span-2 lg:max-w-xl">
        <h3 className="mb-3 font-display text-[15px] font-semibold">Change password</h3>
        <InlineForm key={pwKey} submitLabel="Change password" initial={{ current: '', next: '' }}
          fields={[{ name: 'current', label: 'Current password', type: 'password', required: true }, { name: 'next', label: 'New password, at least 8 characters', type: 'password', required: true }]}
          onSubmit={async (v) => { await api('/auth/change-password', { body: v }); toast.success('Password changed. Other devices are signed out.'); setPwKey((k) => k + 1) }} />
      </Card>
      <FormDialog open={leave} onClose={() => setLeave(false)} title="Ask for leave" submitLabel="Send request" initial={{ startDate: todayStr(), endDate: todayStr() }}
        fields={[{ name: 'leaveTypeId', label: 'Leave type', type: 'select', options: data.leaveTypes.map((t: any) => ({ value: t.id, label: t.name })), required: true, full: true }, { name: 'startDate', label: 'From', type: 'date', required: true }, { name: 'endDate', label: 'To', type: 'date', required: true }, { name: 'reason', label: 'Reason', type: 'textarea' }]}
        onSubmit={async (v) => { await api('/me/leave-requests', { body: v }); toast.success('Leave request sent for approval'); reload() }} />
    </div>
  )
}
