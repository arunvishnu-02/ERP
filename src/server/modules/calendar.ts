// The Calendar: one month view that gathers dated items from every module the person may see,
// plus events people add by hand. Amounts are never sent; finance items appear for Admin only.
import { Router } from '../core/router'
import { can, scopeIds } from '../core/auth'
import { bad, forbidden, isUuid, notFound, parse, shape } from '../core/http'
import { addDays, dateOnly, SCOPES, ymd } from '../core/util'
import { env } from '../env'
import { prisma } from '../db'

export const calendarRouter = Router()

export type CalendarKind = 'task' | 'meeting' | 'deadline' | 'followup' | 'renewal' | 'birthday' | 'leave' | 'holiday' | 'payroll' | 'invoice' | 'event'
export interface CalendarItem { id: string; kind: CalendarKind; date: string; end?: string; time?: string; title: string; sub?: string; link?: string; mine?: boolean; shared?: boolean; notes?: string | null }

const DAY = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const fmtDay = new Intl.DateTimeFormat('en-CA', { timeZone: env.timezone })
const fmtTime = new Intl.DateTimeFormat('en-GB', { timeZone: env.timezone, hour: '2-digit', minute: '2-digit', hour12: false })
/** The local day and time of a moment, so a 9 pm UTC due time lands on the right Indian day. */
const localDay = (d: Date) => fmtDay.format(d)
const localTime = (d: Date) => fmtTime.format(d)
const name = (p: { firstName: string; lastName?: string | null }) => [p.firstName, p.lastName].filter(Boolean).join(' ')

/** Where-clause for a module, or null when the person cannot view it. */
async function scope(user: any, module: string, key = module) {
  const s = can(user, module, 'VIEW')
  if (!s) return null
  const ids = await scopeIds(user, s)
  return ids && SCOPES[key] ? SCOPES[key](ids, s) : {}
}

calendarRouter.get('/', async (req, res) => {
  const from = String(req.query.from ?? '')
  const to = String(req.query.to ?? '')
  if (!DAY.test(from) || !DAY.test(to) || to < from) throw bad('Pick a date range')
  const start = dateOnly(from)
  const endEx = addDays(dateOnly(to), 1)
  if (endEx.getTime() - start.getTime() > 62 * 864e5) throw bad('Pick at most two months at a time')
  const u = req.user
  const org = u.organizationId
  // moments are fetched with a day of margin either side, then kept by their local day
  const wide = { gte: addDays(start, -1), lt: addDays(endEx, 1) }
  const dateRange = { gte: start, lt: endEx }
  const inRange = (day: string) => day >= from && day <= to
  const items: CalendarItem[] = []
  const jobs: Promise<void>[] = []

  const tasks = await scope(u, 'TASKS')
  if (tasks) jobs.push((async () => {
    const rows = await prisma.task.findMany({
      where: { organizationId: org, deletedAt: null, dueDate: wide, status: { notIn: ['DONE', 'CANCELLED'] as any }, ...tasks },
      select: { id: true, title: true, taskNumber: true, dueDate: true, priority: true, assignee: { select: { firstName: true, lastName: true } } },
      take: 500,
    })
    for (const t of rows) {
      const day = localDay(t.dueDate!)
      if (inRange(day)) items.push({ id: `task-${t.id}`, kind: 'task', date: day, title: t.title, sub: [t.taskNumber, t.assignee ? name(t.assignee) : null, t.priority === 'HIGH' || t.priority === 'URGENT' ? `${t.priority.toLowerCase()} priority` : null].filter(Boolean).join(' · '), link: '/tasks' })
    }
  })())

  const projects = await scope(u, 'PROJECTS')
  if (projects) jobs.push((async () => {
    const [rows, milestones] = await Promise.all([
      prisma.project.findMany({ where: { organizationId: org, deletedAt: null, dueDate: dateRange, status: { notIn: ['COMPLETED', 'CANCELLED'] as any }, ...projects }, select: { id: true, name: true, projectNumber: true, dueDate: true }, take: 200 }),
      prisma.milestone.findMany({ where: { dueDate: dateRange, completedAt: null, project: { organizationId: org, deletedAt: null, ...projects } }, select: { id: true, name: true, dueDate: true, project: { select: { name: true } } }, take: 200 }),
    ])
    for (const p of rows) items.push({ id: `project-${p.id}`, kind: 'deadline', date: ymd(p.dueDate!), title: `${p.name} due`, sub: p.projectNumber, link: '/projects' })
    for (const m of milestones) items.push({ id: `milestone-${m.id}`, kind: 'deadline', date: ymd(m.dueDate!), title: m.name, sub: `Milestone · ${m.project.name}`, link: '/projects' })
  })())

  const leads = await scope(u, 'LEADS')
  if (leads) jobs.push((async () => {
    const rows = await prisma.lead.findMany({ where: { organizationId: org, deletedAt: null, status: 'OPEN' as any, nextFollowUpAt: wide, ...leads }, select: { id: true, firstName: true, lastName: true, companyName: true, nextFollowUpAt: true }, take: 300 })
    for (const l of rows) {
      const day = localDay(l.nextFollowUpAt!)
      if (inRange(day)) items.push({ id: `lead-${l.id}`, kind: 'followup', date: day, time: localTime(l.nextFollowUpAt!), title: `Follow up ${name(l)}`, sub: l.companyName ?? undefined, link: '/leads' })
    }
  })())

  // Meetings: the ones the person may see in Sales, plus any meeting they organise or attend
  jobs.push((async () => {
    const s = can(u, 'SALES', 'VIEW')
    const ids = s ? await scopeIds(u, s) : [u.id]
    const who = ids === null ? {} : { OR: [{ organizerId: { in: ids } }, { attendees: { some: { userId: u.id } } }] }
    const rows = await prisma.meeting.findMany({ where: { organizationId: org, startsAt: wide, ...who }, select: { id: true, title: true, startsAt: true, location: true, lead: { select: { firstName: true, lastName: true } }, customer: { select: { name: true } } }, take: 300 })
    for (const m of rows) {
      const day = localDay(m.startsAt)
      if (inRange(day)) items.push({ id: `meeting-${m.id}`, kind: 'meeting', date: day, time: localTime(m.startsAt), title: m.title, sub: [m.customer?.name ?? (m.lead ? name(m.lead) : null), m.location].filter(Boolean).join(' · '), link: '/sales' })
    }
  })())

  if (can(u, 'WEBSITES', 'VIEW')) jobs.push((async () => {
    const rows = await prisma.webAsset.findMany({ where: { organizationId: org, expiryDate: dateRange, status: { notIn: ['CANCELLED', 'EXPIRED'] as any } }, select: { id: true, name: true, type: true, expiryDate: true, customer: { select: { name: true } } }, take: 300 })
    for (const a of rows) items.push({ id: `renewal-${a.id}`, kind: 'renewal', date: ymd(a.expiryDate), title: `${a.name} renewal`, sub: [a.type.replace(/_/g, ' ').toLowerCase(), a.customer.name].join(' · '), link: '/websites' })
  })())

  // People: holidays and birthdays for everyone; leave for HR, otherwise the person's own
  jobs.push((async () => {
    const holidays = await prisma.holiday.findMany({ where: { organizationId: org, date: dateRange, OR: [{ branchId: null }, ...(u.branchId ? [{ branchId: u.branchId }] : [])] }, select: { id: true, name: true, date: true, isOptional: true } })
    for (const h of holidays) items.push({ id: `holiday-${h.id}`, kind: 'holiday', date: ymd(h.date), title: h.name, sub: h.isOptional ? 'Optional holiday' : 'Holiday' })
  })())
  jobs.push((async () => {
    const people = await prisma.employee.findMany({ where: { organizationId: org, status: { in: ['ACTIVE', 'ON_NOTICE'] as any }, dateOfBirth: { not: null } }, select: { id: true, firstName: true, lastName: true, dateOfBirth: true } })
    const years = [...new Set([from.slice(0, 4), to.slice(0, 4)])]
    for (const p of people) {
      const md = ymd(p.dateOfBirth!).slice(5)
      for (const y of years) {
        const day = md === '02-29' && Number(y) % 4 !== 0 ? `${y}-02-28` : `${y}-${md}`
        if (inRange(day)) items.push({ id: `birthday-${p.id}-${y}`, kind: 'birthday', date: day, title: `${name(p)}'s birthday` })
      }
    }
  })())
  jobs.push((async () => {
    const all = !!can(u, 'HR', 'VIEW')
    if (!all && !u.employeeId) return
    const rows = await prisma.leaveRequest.findMany({
      where: { organizationId: org, startDate: { lt: endEx }, endDate: { gte: start }, ...(all ? { status: 'APPROVED' as any } : { employeeId: u.employeeId!, status: { in: ['APPROVED', 'PENDING'] as any } }) },
      select: { id: true, startDate: true, endDate: true, status: true, employee: { select: { firstName: true, lastName: true } }, leaveType: { select: { name: true } } },
      take: 300,
    })
    for (const l of rows) items.push({ id: `leave-${l.id}`, kind: 'leave', date: ymd(l.startDate), end: ymd(l.endDate), title: `${name(l.employee)} on leave`, sub: `${l.leaveType.name}${l.status === 'PENDING' ? ' · waiting for approval' : ''}`, link: all ? '/hr' : '/profile' })
  })())

  // Money: Admin only, and never with amounts
  if (u.admin) {
    jobs.push((async () => {
      const [runs, invoices] = await Promise.all([
        prisma.payrollRun.findMany({ where: { organizationId: org, paidOn: dateRange }, select: { id: true, month: true, paidOn: true } }),
        prisma.invoice.findMany({ where: { organizationId: org, deletedAt: null, dueDate: dateRange, status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'] as any } }, select: { id: true, invoiceNumber: true, dueDate: true, customer: { select: { name: true } } }, take: 300 }),
      ])
      for (const r of runs) items.push({ id: `payroll-${r.id}`, kind: 'payroll', date: ymd(r.paidOn!), title: `Salaries paid for ${r.month}`, link: '/hr' })
      for (const i of invoices) items.push({ id: `invoice-${i.id}`, kind: 'invoice', date: ymd(i.dueDate), title: `${i.invoiceNumber} payment due`, sub: i.customer.name, link: '/invoices' })
    })())
  }

  jobs.push((async () => {
    const rows = await prisma.calendarEvent.findMany({ where: { organizationId: org, date: dateRange, OR: [{ createdById: u.id }, { shared: true }] }, include: { createdBy: { select: { firstName: true, lastName: true } } } })
    for (const e of rows) items.push({ id: `event-${e.id}`, kind: 'event', date: ymd(e.date), time: e.time ?? undefined, title: e.title, sub: e.shared ? `For everyone · added by ${name(e.createdBy)}` : undefined, notes: e.notes, mine: e.createdById === u.id || u.admin, shared: e.shared })
  })())

  await Promise.all(jobs)
  items.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title))
  res.json({ from, to, items, canShare: u.admin, finance: u.admin })
})

const eventSpec = { title: 's', date: 's', 'time?': 's', 'notes?': 's', 'shared?': 'b' } as const
function check(d: { title: string; date: string; time?: string | null }) {
  if (!d.title.trim()) throw bad('Give the event a name')
  if (!DAY.test(d.date)) throw bad('Pick a date')
  if (d.time && !TIME.test(d.time)) throw bad('Enter the time as HH:MM')
}

calendarRouter.post('/events', async (req, res) => {
  const d = parse(shape(eventSpec), req.body)
  check(d)
  if (d.shared && !req.user.admin) throw forbidden('Only Admin can add an event for everyone')
  const e = await prisma.calendarEvent.create({ data: { organizationId: req.user.organizationId, title: d.title.trim(), date: dateOnly(d.date), time: d.time || null, notes: d.notes || null, shared: !!d.shared, createdById: req.user.id } })
  res.status(201).json(e)
})

async function own(req: any) {
  const e = isUuid(req.params.id) ? await prisma.calendarEvent.findFirst({ where: { id: String(req.params.id), organizationId: req.user.organizationId } }) : null
  if (!e) throw notFound('Event')
  if (e.createdById !== req.user.id && !req.user.admin) throw forbidden('You can only change your own events')
  return e
}
calendarRouter.put('/events/:id', async (req, res) => {
  const e = await own(req)
  const d = parse(shape(eventSpec), req.body)
  check(d)
  if (d.shared && !req.user.admin) throw forbidden('Only Admin can add an event for everyone')
  res.json(await prisma.calendarEvent.update({ where: { id: e.id }, data: { title: d.title.trim(), date: dateOnly(d.date), time: d.time || null, notes: d.notes || null, shared: req.user.admin ? !!d.shared : e.shared } }))
})
calendarRouter.delete('/events/:id', async (req, res) => {
  const e = await own(req)
  await prisma.calendarEvent.delete({ where: { id: e.id } })
  res.json({ ok: true })
})
