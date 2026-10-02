import { Router } from 'express'
import { authorize } from '../core/auth.js'
import { crud, findScoped } from '../core/crud.js'
import { bad, conflict, parse, shape } from '../core/http.js'
import { notify, SCOPES, U } from '../core/util.js'
import { prisma } from '../db.js'
import * as E from '../generated/prisma/enums.js'

const M = 'TASKS'
export const tasksRouter = Router()
const find = (req: any) => findScoped(req, 'task', M, 'EDIT', { soft: true, label: 'Task' })

tasksRouter.get('/timer', authorize(M, 'VIEW'), async (req, res) => {
  res.json(await prisma.timeEntry.findFirst({ where: { userId: req.user.id, endedAt: null }, include: { task: { select: { id: true, title: true } } } }))
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
