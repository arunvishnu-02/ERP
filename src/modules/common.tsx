'use client'
import { toast } from 'sonner'
import { Avatar, Badge } from '@/components/ui'
import { useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { daysFromToday, fmtDate, fmtShort, personName } from '@/lib/format'

export const userOptions = (lookups: any) => lookups.users.filter((u: any) => u.status === 'ACTIVE').map((u: any) => ({ value: u.id, label: u.name }))
export const stateOptions = (lookups: any) => lookups.states.map((s: any) => ({ value: s.code, label: s.name }))
export const byId = (list: any[], id?: string | null) => list.find((x) => x.id === id)

export function useCustomerOptions(enabled = true) {
  const { can } = useAuth()
  const { data } = useApi<{ items: any[] }>(enabled && can('CUSTOMERS') ? '/customers?limit=500' : null)
  return (data?.items ?? []).map((c) => ({ value: c.id as string, label: c.name as string }))
}

/** Runs an action and shows the result as a toast. Returns true when it worked. */
export async function act(fn: () => Promise<unknown>, done?: string) {
  try {
    await fn()
    if (done) toast.success(done)
    return true
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'That did not work')
    return false
  }
}

export function DueTag({ date, done }: { date?: string | null; done?: boolean }) {
  if (!date) return <span className="text-muted">None</span>
  if (done) return <span className="whitespace-nowrap text-muted">{fmtDate(date)}</span>
  const n = daysFromToday(date)
  if (n < 0) return <Badge tone="bad">{-n} d overdue</Badge>
  if (n === 0) return <Badge tone="warn">Today</Badge>
  return <span className="whitespace-nowrap text-muted">{fmtShort(date)}</span>
}
export function ExpiryTag({ date }: { date: string }) {
  const n = daysFromToday(date)
  if (n < 0) return <Badge tone="bad">Expired {-n} d ago</Badge>
  if (n <= 30) return <Badge tone={n <= 7 ? 'bad' : 'warn'}>{n === 0 ? 'Expires today' : `${n} d left`}</Badge>
  return <span className="whitespace-nowrap text-muted">{fmtDate(date)}</span>
}
export const Person = ({ user }: { user?: any }) => (user ? <span className="flex items-center gap-2 whitespace-nowrap"><Avatar name={personName(user)} />{personName(user)}</span> : <span className="text-muted">Unassigned</span>)
export const NoAccess = ({ what }: { what: string }) => <div className="rounded-xl border border-line bg-surface px-4 py-12 text-center text-sm text-muted">Your role does not include {what}. A Super Admin can change this under Settings, Roles and permissions.</div>
