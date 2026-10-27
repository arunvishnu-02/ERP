import { Router } from '../core/router'
import { authorize, can } from '../core/auth'
import { crud, findScoped } from '../core/crud'
import { createInvoice } from '../core/docs'
import { conflict, forbidden, notFound, parse, shape, stripNulls } from '../core/http'
import { activity, audit, notify, SCOPES, scoped, U, usersWith } from '../core/util'
import { prisma, type Tx } from '../db'
import { checkPlan, people, plannerScope, savePlan, managedDepartments, TEAM_LEADER } from '../core/assign'
import * as E from '../../generated/prisma/enums'

const M = 'PROJECTS'
const TEAM = { select: { id: true, name: true, leadId: true, lead: U } }
const PLAN = { members: { select: { userId: true } }, extraDepartments: { select: { departmentId: true } } }
const DEPT = { select: { id: true, name: true } }

async function checkTeam(tx: Tx, req: any, teamId: string) {
  if (!(await tx.team.findFirst({ where: { id: teamId, organizationId: req.user.organizationId } }))) throw notFound('Team')
}
/** The team's lead hears about a project given to their team. */
async function tellTeamLead(tx: Tx, row: any, req: any) {
  const team = await tx.team.findFirst({ where: { id: row.teamId }, select: { leadId: true, name: true } })
  if (team?.leadId && team.leadId !== req.user.id && team.leadId !== row.managerId) await notify(tx, row.organizationId, team.leadId, 'project.assigned', `New project for ${team.name}: ${row.name}`, '/projects')
}
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
      customer: { select: { id: true, name: true } }, manager: U, team: TEAM, teamLead: U, department: DEPT, extraDepartments: { select: { department: DEPT } }, quotation: { select: { id: true, quotationNumber: true } }, members: { include: { user: U } },
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
  const p = await findScoped(req, 'project', M, 'EDIT', { soft: true, label: 'Project', include: PLAN })
  if (!plannerScope(req.user)) throw forbidden('Only Admin or a Manager can add or remove project members')
  await prisma.$transaction(async (tx) => {
    const plan = await checkPlan(tx, req.user, { memberIds: d.userIds }, p)
    await savePlan(tx, p, { memberIds: plan.memberIds }, req.user.id, notify)
  })
  res.status(204).end()
})

/**
 * The people who can be put on a project of the chosen departments: active users only, by department, with their roles.
 * Admin sees every department; a Manager only the departments they look after.
 */
projectsRouter.get('/eligible', authorize(M, 'VIEW'), async (req, res) => {
  const planner = plannerScope(req.user)
  if (!planner) throw forbidden('Only Admin or a Manager can plan project members')
  const org = req.user.organizationId
  const asked = String(req.query.departmentIds ?? '').split(',').filter(Boolean)
  const mine = planner === 'DEPARTMENT' ? await managedDepartments(prisma as unknown as Tx, req.user) : null
  const departments = await prisma.department.findMany({ where: { organizationId: org, ...(asked.length ? { id: { in: asked } } : {}), ...(mine ? { id: { in: asked.length ? asked.filter((x) => mine.includes(x)) : mine } } : {}) }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
  const users = await prisma.user.findMany({
    where: { organizationId: org, deletedAt: null, status: 'ACTIVE', departmentId: { in: departments.map((x) => x.id) } },
    select: { id: true, firstName: true, lastName: true, email: true, departmentId: true, managerId: true, roles: { select: { role: { select: { key: true, name: true } } } }, employee: { select: { designation: true } } },
    orderBy: { firstName: 'asc' },
  })
  const teams = await prisma.team.findMany({ where: { organizationId: org, leadId: { in: users.map((u) => u.id) } }, select: { leadId: true, members: { select: { userId: true } } } })
  // who can be the project manager: active Admins and Managers (a Manager plans only inside their own departments)
  const managers = await prisma.user.findMany({
    where: { organizationId: org, deletedAt: null, status: 'ACTIVE', roles: { some: { role: { key: { in: ['SUPER_ADMIN', 'MANAGER'] } } } }, ...(mine ? { OR: [{ id: req.user.id }, { departmentId: { in: mine } }] } : {}) },
    select: { id: true, firstName: true, lastName: true, departmentId: true }, orderBy: { firstName: 'asc' },
  })
  res.json({
    managers: managers.map((m) => ({ id: m.id, name: [m.firstName, m.lastName].filter(Boolean).join(' '), departmentId: m.departmentId })),
    departments: departments.map((dep) => ({
      ...dep,
      people: users.filter((u) => u.departmentId === dep.id).map((u) => ({
        id: u.id, name: [u.firstName, u.lastName].filter(Boolean).join(' '), email: u.email, designation: u.employee?.designation ?? null, managerId: u.managerId,
        roles: u.roles.map((r) => r.role.name), teamLeader: u.roles.some((r) => r.role.key === TEAM_LEADER),
        team: teams.filter((t) => t.leadId === u.id).flatMap((t) => t.members.map((m) => m.userId)).filter((id) => id !== u.id),
      })),
    })),
    canCrossDepartment: req.user.admin,
  })
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
  fields: {
    name: 's', description: 's?', customerId: 'id', 'category?': Object.values(E.ServiceCategory), 'status?': Object.values(E.ProjectStatus), 'priority?': Object.values(E.Priority), startDate: 'd?', dueDate: 'd?', budget: 'n?',
    managerId: 'id?', teamId: 'id?', departmentId: 'id?', teamLeadId: 'id?', 'crossDepartment?': 'b', 'memberIds?': 's[]', 'extraDepartmentIds?': 's[]',
  },
  search: ['name', 'projectNumber', 'customer.name'], filters: ['status', 'customerId', 'managerId', 'category', 'teamId', 'departmentId', 'teamLeadId'],
  include: {
    customer: { select: { id: true, name: true } }, manager: U, teamLead: U, team: TEAM, department: DEPT, extraDepartments: { select: { department: DEPT } },
    members: { select: { userId: true, user: U } }, milestones: { select: { id: true, status: true } },
  },
  beforeCreate: async (d, req, tx) => {
    d.category ??= 'OTHER'
    const plan = await checkPlan(tx, req.user, d, null)
    delete d.memberIds
    delete d.extraDepartmentIds
    Object.assign(d, { departmentId: plan.departmentId, teamLeadId: plan.teamLeadId, crossDepartment: plan.crossDepartment })
    if (plan.teamId !== undefined) d.teamId = plan.teamId
    else if (d.teamId) await checkTeam(tx, req, d.teamId)
    ;(req as any).plan = plan
  },
  afterCreate: async (row, req, tx) => {
    await activity(tx, row.organizationId, 'PROJECT', row.id, 'CREATED', 'Project created', req.user.id)
    await savePlan(tx, row, (req as any).plan, req.user.id, notify)
    // show the saved people in the reply
    Object.assign(row, await tx.project.findUniqueOrThrow({ where: { id: row.id }, select: { members: { select: { userId: true, user: U } }, extraDepartments: { select: { department: DEPT } } } }))
    if (row.managerId !== req.user.id) await notify(tx, row.organizationId, row.managerId, 'project.assigned', `New project assigned to you: ${row.name}`, '/projects')
    if (row.teamLeadId && row.teamLeadId !== req.user.id && row.teamLeadId !== row.managerId) await notify(tx, row.organizationId, row.teamLeadId, 'project.assigned', `New project for your team: ${row.name}`, '/projects')
    else if (row.teamId && !row.teamLeadId) await tellTeamLead(tx, row, req)
  },
  beforeUpdate: async (d, before, req, tx) => {
    if (d.status && d.status !== before.status) d.completedAt = d.status === 'COMPLETED' ? new Date() : null
    const full = await tx.project.findUniqueOrThrow({ where: { id: before.id }, include: PLAN })
    const plan = await checkPlan(tx, req.user, d, full)
    const membersGiven = d.memberIds !== undefined
    delete d.memberIds
    delete d.extraDepartmentIds
    if (d.teamId !== undefined && (d.teamId ?? null) !== before.teamId && !plannerScope(req.user)) throw forbidden('Only Admin or a Manager can change the team of a project')
    if ('departmentId' in plan) {
      Object.assign(d, { departmentId: plan.departmentId, teamLeadId: plan.teamLeadId, crossDepartment: plan.crossDepartment })
      if (plan.managerId) d.managerId = plan.managerId
      if (plan.teamId !== undefined) d.teamId = plan.teamId
      else if (d.teamId && d.teamId !== before.teamId) await checkTeam(tx, req, d.teamId)
      await savePlan(tx, full, { memberIds: membersGiven ? plan.memberIds : undefined, extraDepartmentIds: plan.extraDepartmentIds }, req.user.id, notify)
    }
  },
  afterUpdate: async (row, before, req, tx) => {
    if (row.teamLeadId && row.teamLeadId !== before.teamLeadId && row.teamLeadId !== req.user.id) await notify(tx, row.organizationId, row.teamLeadId, 'project.assigned', `New project for your team: ${row.name}`, '/projects')
    else if (row.teamId && row.teamId !== before.teamId && !row.teamLeadId) await tellTeamLead(tx, row, req)
  },
}))
