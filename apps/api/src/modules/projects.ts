import { Router } from 'express'
import { authorize, can } from '../core/auth.js'
import { crud, findScoped } from '../core/crud.js'
import { createInvoice } from '../core/docs.js'
import { conflict, notFound, parse, shape, stripNulls } from '../core/http.js'
import { activity, audit, notify, SCOPES, scoped, U, usersWith } from '../core/util.js'
import { prisma, type Tx } from '../db.js'
import * as E from '../generated/prisma/enums.js'

const M = 'PROJECTS'
export const projectsRouter = Router()

async function refreshProgress(tx: Tx, projectId: string) {
  const ms = await tx.milestone.findMany({ where: { projectId }, select: { status: true } })
  const done = ms.filter((m) => m.status === 'COMPLETED' || m.status === 'INVOICED').length
  await tx.project.update({ where: { id: projectId }, data: { progressPercent: ms.length ? Math.round((done / ms.length) * 100) : 0 } })
}
async function findMilestone(req: any, action: 'VIEW' | 'EDIT') {
  const w = await scoped(req, M, action)
  const ms = w && (await prisma.milestone.findFirst({ where: { id: req.params.mid, project: { organizationId: req.user.organizationId, deletedAt: null, AND: [w] } }, include: { project: true, invoiceItems: { include: { invoice: { select: { id: true, status: true } } } } } }))
  if (!ms) throw notFound('Milestone')
  return ms
}
const liveInvoice = (ms: any) => ms.invoiceItems.map((i: any) => i.invoice).find((i: any) => !['VOID', 'CANCELLED'].includes(i.status))

projectsRouter.get('/:id/detail', authorize(M, 'VIEW'), async (req, res) => {
  const p = await findScoped(req, 'project', M, 'VIEW', {
    soft: true, label: 'Project',
    include: {
      customer: { select: { id: true, name: true } }, manager: U, quotation: { select: { id: true, quotationNumber: true } }, members: { include: { user: U } },
      milestones: { orderBy: { position: 'asc' }, include: { invoiceItems: { select: { invoice: { select: { id: true, invoiceNumber: true, status: true, balanceDue: true, totalAmount: true } } } } } },
    },
  })
  const [openTasks, tasks] = await Promise.all([
    prisma.task.count({ where: { projectId: p.id, deletedAt: null, status: { notIn: ['DONE', 'CANCELLED'] } } }),
    prisma.task.findMany({ where: { projectId: p.id, deletedAt: null }, include: { assignee: U }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ])
  res.json({ ...p, openTasks, tasks, milestones: p.milestones.map(({ invoiceItems, ...m }: any) => ({ ...m, invoice: liveInvoice({ invoiceItems }) ?? null })) })
})

projectsRouter.put('/:id/members', authorize(M, 'EDIT'), async (req, res) => {
  const d = parse(shape({ userIds: 's[]' }), req.body)
  const p = await findScoped(req, 'project', M, 'EDIT', { soft: true, label: 'Project' })
  const ids = [...new Set(d.userIds as string[])].filter((id) => id !== p.managerId)
  const before = await prisma.projectMember.findMany({ where: { projectId: p.id }, select: { userId: true } })
  await prisma.$transaction(async (tx) => {
    await tx.projectMember.deleteMany({ where: { projectId: p.id } })
    await tx.projectMember.createMany({ data: ids.map((userId) => ({ projectId: p.id, userId })) })
    for (const uid of ids) if (!before.some((b) => b.userId === uid) && uid !== req.user.id) await notify(tx, p.organizationId, uid, 'project.member', `You were added to the project ${p.name}`, '/projects')
  })
  res.status(204).end()
})

const msSpec = { name: 's', description: 's?', dueDate: 'd?', 'isBillable?': 'b', amount: 'n?' } as const
projectsRouter.post('/:id/milestones', authorize(M, 'EDIT'), async (req, res) => {
  const d = stripNulls(parse(shape(msSpec), req.body))
  const p = await findScoped(req, 'project', M, 'EDIT', { soft: true, label: 'Project' })
  const ms = await prisma.$transaction(async (tx) => {
    const row = await tx.milestone.create({ data: { ...d, projectId: p.id, position: await tx.milestone.count({ where: { projectId: p.id } }), isBillable: d.isBillable ?? Number(d.amount ?? 0) > 0 } })
    await refreshProgress(tx, p.id)
    return row
  })
  res.status(201).json(ms)
})
projectsRouter.patch('/milestones/:mid', authorize(M, 'EDIT'), async (req, res) => {
  const d = parse(shape(msSpec).partial(), req.body)
  const ms = await findMilestone(req, 'EDIT')
  res.json(await prisma.milestone.update({ where: { id: ms.id }, data: d }))
})
projectsRouter.delete('/milestones/:mid', authorize(M, 'EDIT'), async (req, res) => {
  const ms = await findMilestone(req, 'EDIT')
  if (liveInvoice(ms)) throw conflict('This milestone already has an invoice')
  await prisma.$transaction(async (tx) => {
    await tx.invoiceItem.updateMany({ where: { milestoneId: ms.id }, data: { milestoneId: null } })
    await tx.task.updateMany({ where: { milestoneId: ms.id }, data: { milestoneId: null } })
    await tx.milestone.delete({ where: { id: ms.id } })
    await refreshProgress(tx, ms.projectId)
  })
  res.status(204).end()
})

projectsRouter.post('/milestones/:mid/complete', authorize(M, 'EDIT'), async (req, res) => {
  const ms = await findMilestone(req, 'EDIT')
  if (ms.status !== 'PENDING' && ms.status !== 'IN_PROGRESS') throw conflict('This milestone is already completed')
  const organizationId = ms.project.organizationId
  const out = await prisma.$transaction(async (tx) => {
    await tx.milestone.update({ where: { id: ms.id }, data: { status: 'COMPLETED', completedAt: new Date() } })
    if (ms.project.status === 'PLANNING') await tx.project.update({ where: { id: ms.projectId }, data: { status: 'IN_PROGRESS' } })
    await refreshProgress(tx, ms.projectId)
    await activity(tx, organizationId, 'PROJECT', ms.projectId, 'UPDATED', `Milestone completed: ${ms.name}`, req.user.id)
    let invoice: any = null
    const rule = await tx.automationRule.findFirst({ where: { organizationId, trigger: 'MILESTONE_COMPLETED', isActive: true } })
    if (rule && ms.isBillable && Number(ms.amount ?? 0) > 0 && !liveInvoice(ms)) {
      invoice = await createInvoice(tx, organizationId, req.user.id, { customerId: ms.project.customerId, projectId: ms.projectId, items: [{ description: `${ms.project.name}: ${ms.name}`, quantity: 1, unitPrice: Number(ms.amount), milestoneId: ms.id }] })
      await tx.automationRule.update({ where: { id: rule.id }, data: { runCount: { increment: 1 }, lastRunAt: new Date() } })
      await tx.automationRun.create({ data: { organizationId, ruleId: rule.id, entityType: 'MILESTONE', entityId: ms.id, status: 'SUCCEEDED', finishedAt: new Date(), log: { invoiceId: invoice.id } } })
      await activity(tx, organizationId, 'INVOICE', invoice.id, 'CREATED', `Draft created automatically for milestone "${ms.name}"`, null)
      for (const uid of await usersWith(tx, organizationId, 'INVOICES', 'CREATE')) if (uid !== req.user.id) await notify(tx, organizationId, uid, 'invoice.drafted', `Draft invoice ready to review: ${ms.project.name}, ${ms.name}`, '/invoices')
    }
    await audit(tx, req, 'UPDATE', M, 'Milestone', ms.id, { status: ms.status }, { status: 'COMPLETED' })
    return { invoice }
  })
  res.json(out)
})

/** Draft an invoice by hand for a completed milestone (when the automation is off, or its invoice was voided). */
projectsRouter.post('/milestones/:mid/invoice', async (req, res) => {
  if (!can(req.user, 'INVOICES', 'CREATE')) throw conflict('You do not have permission to create invoices')
  const ms = await findMilestone(req, 'VIEW')
  if (liveInvoice(ms)) throw conflict('This milestone already has an invoice')
  const invoice = await prisma.$transaction((tx) => createInvoice(tx, ms.project.organizationId, req.user.id, { customerId: ms.project.customerId, projectId: ms.projectId, items: [{ description: `${ms.project.name}: ${ms.name}`, quantity: 1, unitPrice: Number(ms.amount ?? 0), milestoneId: ms.id }] }))
  res.status(201).json(invoice)
})

projectsRouter.post('/:id/complete', authorize(M, 'EDIT'), async (req, res) => {
  const p = await findScoped(req, 'project', M, 'EDIT', { soft: true, label: 'Project', include: { milestones: true } })
  if (p.milestones.some((m: any) => m.status === 'PENDING' || m.status === 'IN_PROGRESS')) throw conflict('Complete every milestone first')
  const unpaid = await prisma.invoice.count({ where: { projectId: p.id, deletedAt: null, status: { in: ['DRAFT', 'SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'] } } })
  if (unpaid) throw conflict(`${unpaid} invoice${unpaid > 1 ? 's are' : ' is'} not paid yet`)
  const row = await prisma.$transaction(async (tx) => {
    const u = await tx.project.update({ where: { id: p.id }, data: { status: 'COMPLETED', completedAt: new Date(), progressPercent: 100 } })
    await activity(tx, p.organizationId, 'PROJECT', p.id, 'STATUS_CHANGED', 'Project completed', req.user.id)
    await audit(tx, req, 'UPDATE', M, 'Project', p.id, { status: p.status }, { status: 'COMPLETED' })
    return u
  })
  res.json(row)
})

projectsRouter.use('/', crud({
  model: 'project', module: M, label: 'Project', soft: true, by: true, number: ['projectNumber', 'PROJECT'], ownerField: 'managerId', scope: SCOPES.PROJECTS,
  fields: { name: 's', description: 's?', customerId: 'id', 'category?': Object.values(E.ServiceCategory), 'status?': Object.values(E.ProjectStatus), 'priority?': Object.values(E.Priority), startDate: 'd?', dueDate: 'd?', budget: 'n?', managerId: 'id?' },
  search: ['name', 'projectNumber', 'customer.name'], filters: ['status', 'customerId', 'managerId', 'category'],
  include: { customer: { select: { id: true, name: true } }, manager: U, members: { select: { userId: true } }, milestones: { select: { id: true, status: true } } },
  beforeCreate: (d) => { d.category ??= 'OTHER' },
  afterCreate: async (row, req, tx) => {
    await activity(tx, row.organizationId, 'PROJECT', row.id, 'CREATED', 'Project created', req.user.id)
    if (row.managerId !== req.user.id) await notify(tx, row.organizationId, row.managerId, 'project.assigned', `New project assigned to you: ${row.name}`, '/projects')
  },
  beforeUpdate: (d, before) => {
    if (d.status && d.status !== before.status) d.completedAt = d.status === 'COMPLETED' ? new Date() : null
  },
}))
