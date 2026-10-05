import { Router } from '../core/router'
import { authorize } from '../core/auth'
import { crud, findScoped } from '../core/crud'
import { can, scopeIds } from '../core/auth'
import { bad, conflict, forbidden, notFound, parse, shape } from '../core/http'
import { addDays, dateOnly, notify, SCOPES, todayStr, U, ymd } from '../core/util'
import { env } from '../env'
import { prisma } from '../db'
import * as E from '../../generated/prisma/enums'

const M = 'TASKS'
export const tasksRouter = Router()
const find = (req: any) => findScoped(req, 'task', M, 'EDIT', { soft: true, label: 'Task' })

tasksRouter.get('/timer', authorize(M, 'VIEW'), async (req, res) => {
  res.json(await prisma.timeEntry.findFirst({ where: { userId: req.user.id, endedAt: null }, include: { task: { select: { id: true, title: true } } } }))
})
// ── Weekly timesheet ──
const localDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: env.timezone }).format(d)
const monday = (day: string) => { const d = dateOnly(day); return addDays(d, -((d.getUTCDay() + 6) % 7)) }

tasksRouter.get('/timesheet', authorize(M, 'VIEW'), async (req, res) => {
  const week = typeof req.query.week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.week) ? req.query.week : todayStr()
  const start = monday(week)
  const days = Array.from({ length: 7 }, (_, i) => ymd(addDays(start, i)))
  const ids = await scopeIds(req.user, can(req.user, M, 'VIEW')!)
  const team = req.query.who === 'team' && (ids === null || ids.length > 1)
  const rows = await prisma.timeEntry.findMany({
    where: {
      organizationId: req.user.organizationId, endedAt: { not: null },
      startedAt: { gte: addDays(start, -1), lt: addDays(start, 8) },
      ...(team ? (ids ? { userId: { in: ids } } : {}) : { userId: req.user.id }),
    },
    include: { user: U, task: { select: { id: true, title: true, taskNumber: true } }, project: { select: { id: true, name: true } } },
    orderBy: { startedAt: 'asc' },
  })
  const items = rows.map((e) => ({ ...e, day: localDay(e.startedAt) })).filter((e) => days.includes(e.day))
  res.json({ days, items, total: items.reduce((a, e) => a + e.minutes, 0), canTeam: ids === null || ids.length > 1 })
})
tasksRouter.post('/timesheet', authorize(M, 'EDIT'), async (req, res) => {
  const d = parse(shape({ date: 's', minutes: 'i', taskId: 'id?', projectId: 'id?', description: 's?', 'isBillable?': 'b' }), req.body)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw bad('Pick a date')
  if (d.date > todayStr()) throw bad('You cannot log time for a future day')
  if (d.minutes <= 0 || d.minutes > 24 * 60) throw bad('Enter the minutes worked')
  const org = req.user.organizationId
  let projectId = d.projectId ?? null
  if (d.taskId) {
    const t = await prisma.task.findFirst({ where: { id: d.taskId, organizationId: org, deletedAt: null } })
    if (!t) throw notFound('Task')
    projectId = t.projectId
  } else if (projectId && !(await prisma.project.findFirst({ where: { id: projectId, organizationId: org } }))) throw notFound('Project')
  // stored at 06:00 UTC (11:30 in India) so the entry stays on the chosen day
  const startedAt = new Date(dateOnly(d.date).getTime() + 6 * 36e5)
  const [entry] = await prisma.$transaction([
    prisma.timeEntry.create({ data: { organizationId: org, taskId: d.taskId ?? null, projectId, userId: req.user.id, startedAt, endedAt: new Date(startedAt.getTime() + d.minutes * 60000), minutes: d.minutes, description: d.description ?? null, isBillable: d.isBillable ?? true } }),
    ...(d.taskId ? [prisma.task.update({ where: { id: d.taskId }, data: { loggedMinutes: { increment: d.minutes } } })] : []),
  ])
  res.status(201).json(entry)
})
tasksRouter.delete('/timesheet/:entryId', authorize(M, 'EDIT'), async (req, res) => {
  const e = await prisma.timeEntry.findFirst({ where: { id: String(req.params.entryId), organizationId: req.user.organizationId } })
  if (!e) throw notFound('Time entry')
  if (e.userId !== req.user.id && can(req.user, M, 'EDIT') !== 'ALL') throw forbidden('You can only remove your own time')
  if (!e.endedAt) throw conflict('Stop the timer first')
  await prisma.$transaction([
    prisma.timeEntry.delete({ where: { id: e.id } }),
    ...(e.taskId ? [prisma.task.update({ where: { id: e.taskId }, data: { loggedMinutes: { decrement: e.minutes } } })] : []),
  ])
  res.json({ ok: true })
})
tasksRouter.get('/:id/time', authorize(M, 'VIEW'), async (req, res) => {
  const t = await findScoped(req, 'task', M, 'VIEW', { soft: true, label: 'Task' })
  res.json({ items: await prisma.timeEntry.findMany({ where: { taskId: t.id }, include: { user: U }, orderBy: { startedAt: 'desc' } }) })
})
tasksRouter.post('/:id/time', authorize(M, 'EDIT'), async (req, res) => {
  const d = parse(shape({ minutes: 'i', description: 's?', 'isBillable?': 'b' }), req.body)
  if (d.minutes <= 0 || d.minutes > 24 * 60) throw bad('Enter the minutes worked')
  const t = await find(req)
  const now = new Date()
  const [entry] = await prisma.$transaction([
    prisma.timeEntry.create({ data: { organizationId: t.organizationId, taskId: t.id, projectId: t.projectId, userId: req.user.id, startedAt: new Date(now.getTime() - d.minutes * 60000), endedAt: now, minutes: d.minutes, description: d.description ?? null, isBillable: d.isBillable ?? true } }),
    prisma.task.update({ where: { id: t.id }, data: { loggedMinutes: { increment: d.minutes } } }),
  ])
  res.status(201).json(entry)
})
tasksRouter.post('/:id/timer/start', authorize(M, 'EDIT'), async (req, res) => {
  const t = await find(req)
  if (await prisma.timeEntry.findFirst({ where: { userId: req.user.id, endedAt: null } })) throw conflict('Stop your running timer first')
  res.status(201).json(await prisma.timeEntry.create({ data: { organizationId: t.organizationId, taskId: t.id, projectId: t.projectId, userId: req.user.id, startedAt: new Date() } }))
})
tasksRouter.post('/:id/timer/stop', authorize(M, 'EDIT'), async (req, res) => {
  const t = await find(req)
  const running = await prisma.timeEntry.findFirst({ where: { userId: req.user.id, taskId: t.id, endedAt: null } })
  if (!running) throw conflict('No timer is running on this task')
  const minutes = Math.max(1, Math.round((Date.now() - running.startedAt.getTime()) / 60000))
  const [entry] = await prisma.$transaction([
    prisma.timeEntry.update({ where: { id: running.id }, data: { endedAt: new Date(), minutes } }),
    prisma.task.update({ where: { id: t.id }, data: { loggedMinutes: { increment: minutes } } }),
  ])
  res.json(entry)
})

tasksRouter.use('/', crud({
  model: 'task', module: M, label: 'Task', soft: true, number: ['taskNumber', 'TASK'], scope: SCOPES.TASKS,
  fields: {
    title: 's', description: 's?', projectId: 'id?', milestoneId: 'id?', ticketId: 'id?', campaignId: 'id?', contentItemId: 'id?',
    'status?': Object.values(E.TaskStatus), 'priority?': Object.values(E.Priority), startDate: 'd?', dueDate: 'd?', estimatedMinutes: 'i?', assigneeId: 'id?',
  },
  search: ['title', 'taskNumber'], filters: ['status', 'projectId', 'assigneeId', 'priority'], dateField: 'dueDate',
  include: { project: { select: { id: true, name: true } }, assignee: U, reporter: U },
  orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
  where: (req) => (req.query.mine === '1' ? { assigneeId: req.user.id } : {}),
  beforeCreate: (d, req) => {
    d.reporterId = req.user.id
    d.assigneeId ??= req.user.id
    if (d.status === 'DONE') d.completedAt = new Date()
  },
  afterCreate: async (row, req, tx) => {
    if (row.assigneeId && row.assigneeId !== req.user.id) await notify(tx, row.organizationId, row.assigneeId, 'task.assigned', `New task: ${row.title}`, '/tasks')
  },
  beforeUpdate: async (d, before, req, tx) => {
    if (d.status && d.status !== before.status) d.completedAt = d.status === 'DONE' ? new Date() : null
    if (d.assigneeId && d.assigneeId !== before.assigneeId && d.assigneeId !== req.user.id) await notify(tx, before.organizationId, d.assigneeId, 'task.assigned', `Task assigned to you: ${before.title}`, '/tasks')
  },
}))
