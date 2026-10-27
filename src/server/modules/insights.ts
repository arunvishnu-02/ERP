// Dashboard, reports, automation centre and communication centre.
import { Router } from '../core/router'
import { authorize, can, fullName, scopeIds } from '../core/auth'
import { crud, paging } from '../core/crud'
import { runDaily } from '../core/jobs'
import { notFound, parse, shape } from '../core/http'
import { docEmailHtml } from '../core/email-html'
import { sendMail } from '../core/mail'
import { addDays, audit, scoped, today, U, ymd } from '../core/util'
import { prisma } from '../db'

const monthsFrom = (months: number) => {
  const t = today()
  const from = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - (months - 1), 1))
  return { from, keys: Array.from({ length: months }, (_, i) => ymd(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1))).slice(0, 7)) }
}
const OPEN_INV = ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'] as any

/** The founder's view: this month's money, where every deal stands, and who owes what. */
async function companyOverview(organizationId: string, t: Date, months: { billed: number; collected: number; costs: number }[]) {
  const [now, before] = [months[months.length - 1], months[months.length - 2]]
  const monthStart = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1))
  const live = { organizationId, deletedAt: null }
  const [leadsOpen, followUpsToday, sent, pending, oldestPending, projectsOpen, projectsLate, drafts, open, overdue, done, toCollect] = await Promise.all([
    prisma.lead.count({ where: { ...live, status: 'OPEN' } }),
    prisma.lead.count({ where: { ...live, status: 'OPEN', nextFollowUpAt: { lt: addDays(t, 1) } } }),
    prisma.quotation.aggregate({ where: { ...live, isLatest: true, status: { in: ['SENT', 'VIEWED'] } }, _count: true, _sum: { totalAmount: true } }),
    prisma.quotation.aggregate({ where: { ...live, isLatest: true, status: 'PENDING_APPROVAL' }, _count: true, _sum: { totalAmount: true } }),
    prisma.quotation.findFirst({ where: { ...live, isLatest: true, status: 'PENDING_APPROVAL' }, orderBy: { updatedAt: 'asc' }, select: { updatedAt: true } }),
    prisma.project.count({ where: { ...live, status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
    prisma.project.count({ where: { ...live, status: { notIn: ['COMPLETED', 'CANCELLED'] }, dueDate: { lt: t } } }),
    prisma.invoice.aggregate({ where: { ...live, status: 'DRAFT' }, _count: true, _sum: { totalAmount: true } }),
    prisma.invoice.aggregate({ where: { ...live, status: { in: OPEN_INV } }, _count: true, _sum: { balanceDue: true } }),
    prisma.invoice.count({ where: { ...live, status: { in: OPEN_INV }, dueDate: { lt: t } } }),
    prisma.project.count({ where: { ...live, status: 'COMPLETED', updatedAt: { gte: monthStart } } }),
    prisma.invoice.findMany({ where: { ...live, status: { in: OPEN_INV }, balanceDue: { gt: 0 } }, select: { id: true, invoiceNumber: true, balanceDue: true, dueDate: true, customer: { select: { name: true } } }, orderBy: { dueDate: 'asc' }, take: 4 }),
  ])
  const money = (n: unknown) => Number(n ?? 0)
  return {
    billed: now.billed, billedBefore: before?.billed ?? 0, collected: now.collected, costs: now.costs, profit: now.billed - now.costs,
    toCollect: money(open._sum.balanceDue), overdue,
    steps: {
      leads: leadsOpen, followUps: followUpsToday,
      quotations: sent._count, quotationsValue: money(sent._sum.totalAmount),
      approvals: pending._count, approvalsValue: money(pending._sum.totalAmount), approvalDays: oldestPending ? Math.floor((Date.now() - oldestPending.updatedAt.getTime()) / 864e5) : 0,
      projects: projectsOpen, projectsLate,
      invoices: drafts._count, invoicesValue: money(drafts._sum.totalAmount),
      payments: open._count, paymentsValue: money(open._sum.balanceDue),
      completed: done,
    },
    collect: toCollect.map((i) => ({ id: i.id, number: i.invoiceNumber, customer: i.customer.name, amount: money(i.balanceDue), dueDate: i.dueDate })),
  }
}

// ── Dashboard ──
export const dashboardRouter = Router()
/**
 * A Team Leader's view of their team: each person's open, done and late tasks, the team's projects with progress,
 * and the tasks due soon. Empty for people who lead no team.
 */
dashboardRouter.get('/team', authorize('DASHBOARD', 'VIEW'), async (req, res) => {
  const organizationId = req.user.organizationId
  const me = req.user.id
  const t = today()
  const teams = await prisma.team.findMany({ where: { organizationId, leadId: me }, select: { id: true, name: true, department: { select: { id: true, name: true } }, members: { select: { userId: true } } } })
  const memberIds = [...new Set(teams.flatMap((x) => x.members.map((m) => m.userId)).filter((id) => id !== me))]
  const projects = await prisma.project.findMany({
    where: { organizationId, deletedAt: null, OR: [{ teamLeadId: me }, { team: { leadId: me } }] },
    select: { id: true, name: true, status: true, priority: true, dueDate: true, department: { select: { name: true } } },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
  })
  if (!teams.length && !projects.length) return res.json({ leads: false, teams: [], members: [], projects: [], upcoming: [], totals: { open: 0, done: 0, overdue: 0 } })
  const people = [me, ...memberIds]
  const open = { notIn: ['DONE', 'CANCELLED'] as any }
  const [users, byPerson, byProject, upcoming] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: memberIds }, organizationId, deletedAt: null }, select: { id: true, firstName: true, lastName: true, status: true, employee: { select: { designation: true } } }, orderBy: { firstName: 'asc' } }),
    prisma.task.findMany({ where: { organizationId, deletedAt: null, assigneeId: { in: people } }, select: { assigneeId: true, status: true, dueDate: true } }),
    prisma.task.groupBy({ by: ['projectId', 'status'], where: { organizationId, deletedAt: null, projectId: { in: projects.map((p) => p.id) } }, _count: { _all: true } }),
    prisma.task.findMany({
      where: { organizationId, deletedAt: null, status: open, OR: [{ assigneeId: { in: people } }, { projectId: { in: projects.map((p) => p.id) } }], dueDate: { lt: addDays(t, 8) } },
      select: { id: true, title: true, taskNumber: true, status: true, dueDate: true, assignee: U, project: { select: { id: true, name: true } } },
      orderBy: { dueDate: 'asc' }, take: 15,
    }),
  ])
  const count = (id: string) => {
    const mine = byPerson.filter((x) => x.assigneeId === id)
    return {
      open: mine.filter((x) => x.status !== 'DONE' && x.status !== 'CANCELLED').length,
      done: mine.filter((x) => x.status === 'DONE').length,
      overdue: mine.filter((x) => x.status !== 'DONE' && x.status !== 'CANCELLED' && x.dueDate && x.dueDate < t).length,
    }
  }
  const members = users.map((u) => ({ id: u.id, name: fullName(u), designation: u.employee?.designation ?? null, active: u.status === 'ACTIVE', ...count(u.id) }))
  const list = projects.map((p) => {
    const rows = byProject.filter((x) => x.projectId === p.id)
    const total = rows.filter((x) => x.status !== 'CANCELLED').reduce((a, x) => a + x._count._all, 0)
    const done = rows.filter((x) => x.status === 'DONE').reduce((a, x) => a + x._count._all, 0)
    return { ...p, department: p.department?.name ?? null, tasks: total, done, progress: total ? Math.round((done / total) * 100) : 0 }
  })
  const totals = members.reduce((a, m) => ({ open: a.open + m.open, done: a.done + m.done, overdue: a.overdue + m.overdue }), { open: 0, done: 0, overdue: 0 })
  res.json({ leads: true, teams: teams.map((x) => ({ id: x.id, name: x.name, department: x.department?.name ?? null, size: x.members.filter((m) => m.userId !== me).length })), members, projects: list, upcoming: upcoming.map((x) => ({ ...x, assignee: x.assignee ? { id: x.assignee.id, name: fullName(x.assignee) } : null, late: !!x.dueDate && x.dueDate < t })), totals })
})

dashboardRouter.get('/', authorize('DASHBOARD', 'VIEW'), async (req, res) => {
  const organizationId = req.user.organizationId
  const t = today()
  const [wl, wc, wp, wq, wi, wt, ww] = await Promise.all(['LEADS', 'CUSTOMERS', 'PROJECTS', 'QUOTATIONS', 'INVOICES', 'TASKS', 'WEBSITES'].map((m) => scoped(req, m)))
  const kpis: { key: string; label: string; value: number; money?: boolean; hint: string; href: string }[] = []
  const out: any = { kpis }

  if (wl) {
    const base = { organizationId, deletedAt: null, AND: [wl] }
    const [total, open, followUps] = await Promise.all([
      prisma.lead.count({ where: base }),
      prisma.lead.count({ where: { ...base, status: 'OPEN' } }),
      prisma.lead.findMany({ where: { ...base, status: 'OPEN', nextFollowUpAt: { lt: addDays(t, 2) } }, select: { id: true, firstName: true, lastName: true, companyName: true, nextFollowUpAt: true }, orderBy: { nextFollowUpAt: 'asc' }, take: 8 }),
    ])
    kpis.push({ key: 'leads', label: 'Total leads', value: total, hint: `${open} open`, href: '/leads' })
    out.followUps = followUps
  }
  if (wc) kpis.push({ key: 'clients', label: 'Active clients', value: await prisma.customer.count({ where: { organizationId, deletedAt: null, status: 'ACTIVE', AND: [wc] } }), hint: 'customers on record', href: '/customers' })
  if (wp) {
    const base = { organizationId, deletedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED'] as any }, AND: [wp] }
    const [open, dueSoon] = await Promise.all([prisma.project.count({ where: base }), prisma.project.count({ where: { ...base, dueDate: { lt: addDays(t, 7) } } })])
    kpis.push({ key: 'projects', label: 'Open projects', value: open, hint: `${dueSoon} due within 7 days`, href: '/projects' })
  }
  if (wq) {
    const where = { organizationId, deletedAt: null, isLatest: true, status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'VIEWED'] as any }, AND: [wq] }
    const agg = await prisma.quotation.aggregate({ where, _count: true, _sum: { totalAmount: true } })
    kpis.push({ key: 'quotations', label: 'Pending quotations', value: agg._count, hint: `worth ₹${Math.round(Number(agg._sum.totalAmount ?? 0)).toLocaleString('en-IN')}`, href: '/quotations' })
  }
  if (wi) {
    const where = { organizationId, deletedAt: null, status: { in: OPEN_INV }, AND: [wi] }
    const [agg, overdue] = await Promise.all([prisma.invoice.aggregate({ where, _count: true, _sum: { balanceDue: true } }), prisma.invoice.count({ where: { ...where, dueDate: { lt: t } } })])
    kpis.push({ key: 'invoices', label: 'Pending invoices', value: agg._count, hint: `${overdue} overdue`, href: '/invoices' })
    kpis.push({ key: 'payments', label: 'Pending payments', value: Number(agg._sum.balanceDue ?? 0), money: true, hint: 'to be collected', href: '/payments' })
  }
  if (wt) {
    const tasks = await prisma.task.findMany({ where: { organizationId, deletedAt: null, assigneeId: req.user.id, status: { notIn: ['DONE', 'CANCELLED'] }, dueDate: { lt: addDays(t, 1) } }, include: { project: { select: { name: true } } }, orderBy: { dueDate: 'asc' }, take: 8 })
    kpis.push({ key: 'tasks', label: "Today's tasks", value: tasks.length, hint: 'due today or earlier', href: '/tasks' })
    out.tasks = tasks
  }
  const approve = await scoped(req, 'QUOTATIONS', 'APPROVE')
  if (approve) {
    out.approvals = await prisma.quotation.findMany({
      where: { organizationId, deletedAt: null, isLatest: true, status: 'PENDING_APPROVAL', AND: [approve] },
      select: { id: true, quotationNumber: true, totalAmount: true, preparedBy: U, customer: { select: { name: true } }, lead: { select: { firstName: true, lastName: true, companyName: true } } }, take: 8,
    })
  }
  if (ww) out.renewals = await prisma.webAsset.findMany({ where: { organizationId, status: { notIn: ['CANCELLED'] }, expiryDate: { lt: addDays(t, 31) } }, select: { id: true, name: true, type: true, expiryDate: true, customer: { select: { name: true } } }, orderBy: { expiryDate: 'asc' }, take: 8 })
  // money over time, costs (salaries included) and the company overview: Admin only
  if (req.user.admin) {
    const { from, keys } = monthsFrom(6)
    const [inv, pay] = await Promise.all([
      prisma.invoice.findMany({ where: { organizationId, deletedAt: null, status: { notIn: ['DRAFT', 'VOID', 'CANCELLED'] }, issueDate: { gte: from } }, select: { issueDate: true, totalAmount: true } }),
      prisma.payment.findMany({ where: { organizationId, paymentDate: { gte: from } }, select: { paymentDate: true, amount: true, tdsAmount: true } }),
    ])
    const [spent, payroll] = await Promise.all([
      prisma.expense.findMany({ where: { organizationId, status: { in: ['APPROVED', 'PAID'] }, expenseDate: { gte: from } }, select: { expenseDate: true, amount: true, taxAmount: true } }),
      prisma.payrollRun.findMany({ where: { organizationId, status: { not: 'DRAFT' }, month: { gte: keys[0] } }, select: { month: true, totalGross: true } }),
    ])
    out.revenue = keys.map((month) => ({
      month,
      billed: inv.filter((i) => ymd(i.issueDate).startsWith(month)).reduce((a, i) => a + Number(i.totalAmount), 0),
      collected: pay.filter((p) => ymd(p.paymentDate).startsWith(month)).reduce((a, p) => a + Number(p.amount) + Number(p.tdsAmount), 0),
      costs: spent.filter((x) => ymd(x.expenseDate).startsWith(month)).reduce((a, x) => a + Number(x.amount) + Number(x.taxAmount), 0)
        + payroll.filter((r) => r.month === month).reduce((a, r) => a + Number(r.totalGross), 0),
    }))
    out.overview = await companyOverview(organizationId, t, out.revenue)
  }
  if (can(req.user, 'TASKS', 'VIEW') === 'ALL' || can(req.user, 'REPORTS', 'VIEW')) {
    const from = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1))
    const [done, users] = await Promise.all([
      prisma.task.groupBy({ by: ['assigneeId'], where: { organizationId, deletedAt: null, status: 'DONE', completedAt: { gte: from } }, _count: true }),
      prisma.user.findMany({ where: { organizationId, status: 'ACTIVE', deletedAt: null }, select: { id: true, firstName: true, lastName: true } }),
    ])
    out.team = users.map((u) => ({ name: fullName(u), done: done.find((d) => d.assigneeId === u.id)?._count ?? 0 })).sort((a, b) => b.done - a.done)
  }
  const feedScope = can(req.user, 'COMMUNICATION', 'VIEW')
  out.activity = await prisma.activity.findMany({ where: { organizationId, ...(feedScope === 'ALL' ? {} : { actorId: req.user.id }) }, include: { actor: U }, orderBy: { occurredAt: 'desc' }, take: 8 })
  res.json(out)
})

// ── Reports ──
export const reportsRouter = Router()
reportsRouter.get('/overview', authorize('REPORTS', 'VIEW'), async (req, res) => {
  const organizationId = req.user.organizationId
  const months = Math.min(Math.max(Number(req.query.months) || 6, 1), 24)
  const { from, keys } = monthsFrom(months)
  const [leads, stages, sources, deals, invoices, payments, projects, tasksDone, users, time, campaigns, spend] = await Promise.all([
    prisma.lead.findMany({ where: { organizationId, deletedAt: null, createdAt: { gte: from } }, select: { sourceId: true, stageId: true, status: true, ownerId: true } }),
    prisma.leadStage.findMany({ where: { organizationId }, orderBy: { position: 'asc' } }),
    prisma.leadSource.findMany({ where: { organizationId } }),
    prisma.deal.findMany({ where: { organizationId, deletedAt: null }, select: { status: true, value: true } }),
    prisma.invoice.findMany({ where: { organizationId, deletedAt: null, status: { notIn: ['DRAFT', 'VOID', 'CANCELLED'] }, issueDate: { gte: from } }, select: { issueDate: true, taxableAmount: true, totalAmount: true, customer: { select: { name: true } } } }),
    prisma.payment.findMany({ where: { organizationId, paymentDate: { gte: from } }, select: { paymentDate: true, amount: true, method: true } }),
    prisma.project.groupBy({ by: ['status'], where: { organizationId, deletedAt: null }, _count: true }),
    prisma.task.groupBy({ by: ['assigneeId'], where: { organizationId, deletedAt: null, status: 'DONE', completedAt: { gte: from } }, _count: true }),
    prisma.user.findMany({ where: { organizationId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, firstName: true, lastName: true } }),
    prisma.timeEntry.groupBy({ by: ['userId'], where: { organizationId, startedAt: { gte: from } }, _sum: { minutes: true } }),
    prisma.campaign.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, name: true, budget: true } }),
    prisma.adSpend.groupBy({ by: ['campaignId'], where: { organizationId }, _sum: { amount: true, leads: true } }),
  ])
  const sum = <T,>(a: T[], f: (x: T) => number) => a.reduce((n, x) => n + f(x), 0)
  const converted = leads.filter((l) => l.status === 'CONVERTED').length
  const lost = leads.filter((l) => l.status === 'LOST').length
  const byCustomer = new Map<string, number>()
  for (const i of invoices) byCustomer.set(i.customer.name, (byCustomer.get(i.customer.name) ?? 0) + Number(i.taxableAmount))
  const byMethod = new Map<string, number>()
  for (const p of payments) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + Number(p.amount))
  res.json({
    months,
    summary: {
      leads: leads.length, converted, lost, conversionRate: converted + lost ? Math.round((converted / (converted + lost)) * 100) : 0,
      wonValue: sum(deals.filter((d) => d.status === 'WON'), (d) => Number(d.value)), openPipeline: sum(deals.filter((d) => d.status === 'OPEN'), (d) => Number(d.value)),
      billed: sum(invoices, (i) => Number(i.totalAmount)), collected: sum(payments, (p) => Number(p.amount)),
    },
    leadsBySource: [...sources.map((s) => ({ name: s.name, id: s.id as string | null })), { name: 'No source', id: null }].map((s) => ({ name: s.name, leads: leads.filter((l) => l.sourceId === s.id).length, won: leads.filter((l) => l.sourceId === s.id && l.status === 'CONVERTED').length })).filter((s) => s.leads),
    leadsByStage: stages.map((s) => ({ name: s.name, leads: leads.filter((l) => l.stageId === s.id).length })),
    monthly: keys.map((month) => ({ month, billed: sum(invoices.filter((i) => ymd(i.issueDate).startsWith(month)), (i) => Number(i.totalAmount)), collected: sum(payments.filter((p) => ymd(p.paymentDate).startsWith(month)), (p) => Number(p.amount)) })),
    revenueByCustomer: [...byCustomer].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 10),
    paymentsByMethod: [...byMethod].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
    projectsByStatus: projects.map((p) => ({ name: p.status, count: p._count })),
    team: users.map((u) => ({
      name: fullName(u), tasksDone: tasksDone.find((x) => x.assigneeId === u.id)?._count ?? 0, hours: Math.round(((time.find((x) => x.userId === u.id)?._sum.minutes ?? 0) / 60) * 10) / 10,
      leads: leads.filter((l) => l.ownerId === u.id).length, leadsWon: leads.filter((l) => l.ownerId === u.id && l.status === 'CONVERTED').length,
    })),
    campaigns: campaigns.map((c) => {
      const s = spend.find((x) => x.campaignId === c.id)?._sum
      return { name: c.name, budget: Number(c.budget ?? 0), spent: Number(s?.amount ?? 0), leads: s?.leads ?? 0 }
    }),
  })
})

// ── Automation centre ──
export const automationRouter = Router()
automationRouter.get('/', authorize('AUTOMATION', 'VIEW'), async (req, res) => {
  const organizationId = req.user.organizationId
  const [rules, rotation, runs] = await Promise.all([
    prisma.automationRule.findMany({ where: { organizationId }, orderBy: { createdAt: 'asc' } }),
    prisma.leadAssignmentRule.findFirst({ where: { organizationId }, orderBy: { priority: 'desc' } }),
    prisma.automationRun.findMany({ where: { organizationId }, include: { rule: { select: { name: true } } }, orderBy: { startedAt: 'desc' }, take: 30 }),
  ])
  res.json({ rules, rotation, runs })
})
automationRouter.patch('/:id', authorize('AUTOMATION', 'EDIT'), async (req, res) => {
  const d = parse(shape({ isActive: 'b' }), req.body)
  const r = await prisma.automationRule.findFirst({ where: { id: String(req.params.id), organizationId: req.user.organizationId } })
  if (!r) throw notFound('Automation')
  const row = await prisma.automationRule.update({ where: { id: r.id }, data: { isActive: d.isActive, updatedById: req.user.id } })
  await audit(prisma as any, req, 'UPDATE', 'AUTOMATION', 'AutomationRule', r.id, { isActive: r.isActive }, d)
  res.json(row)
})
automationRouter.put('/rotation', authorize('AUTOMATION', 'EDIT'), async (req, res) => {
  const d = parse(shape({ assigneeIds: 's[]', 'isActive?': 'b' }), req.body)
  const organizationId = req.user.organizationId
  const cur = await prisma.leadAssignmentRule.findFirst({ where: { organizationId } })
  const data = { assigneeIds: d.assigneeIds, isActive: d.isActive ?? true, lastAssignedIndex: 0 }
  res.json(cur ? await prisma.leadAssignmentRule.update({ where: { id: cur.id }, data }) : await prisma.leadAssignmentRule.create({ data: { ...data, organizationId, name: 'Lead rotation', strategy: 'ROUND_ROBIN' } }))
})
automationRouter.post('/run-now', authorize('AUTOMATION', 'EDIT'), async (req, res) => {
  res.json(await runDaily(req.user.organizationId))
})

// ── Communication centre ──
export const communicationRouter = Router()
const C = 'COMMUNICATION'
communicationRouter.get('/feed', authorize(C, 'VIEW'), async (req, res) => {
  const ids = await scopeIds(req.user, req.scope)
  const where = { organizationId: req.user.organizationId, ...(ids ? { actorId: { in: ids } } : {}) }
  const [items, total] = await Promise.all([prisma.activity.findMany({ where, include: { actor: U }, orderBy: { occurredAt: 'desc' }, ...paging(req, 200) }), prisma.activity.count({ where })])
  res.json({ items, total })
})
communicationRouter.get('/messages', authorize(C, 'VIEW'), async (req, res) => {
  const ids = await scopeIds(req.user, req.scope)
  const where: any = { organizationId: req.user.organizationId, ...(ids ? { sentById: { in: ids } } : {}) }
  if (typeof req.query.channel === 'string' && req.query.channel) where.channel = req.query.channel
  const [items, total] = await Promise.all([
    prisma.message.findMany({ where, include: { sentBy: U, customer: { select: { name: true } }, lead: { select: { firstName: true, lastName: true, companyName: true } } }, orderBy: { createdAt: 'desc' }, ...paging(req, 200) }),
    prisma.message.count({ where }),
  ])
  res.json({ items, total })
})
communicationRouter.post('/email', authorize(C, 'CREATE'), async (req, res) => {
  const d = parse(shape({ to: 's', subject: 's', body: 's', leadId: 'id?', customerId: 'id?' }), req.body)
  const html = await docEmailHtml(req.user.organizationId, { kind: 'Message', heading: d.subject, body: d.body })
  res.json(await sendMail(req.user.organizationId, { to: d.to, subject: d.subject, text: d.body, html, sentById: req.user.id, leadId: d.leadId, customerId: d.customerId }))
})
/** WhatsApp opens on the user's own phone or WhatsApp Web; this records that a message was started. */
communicationRouter.post('/whatsapp', authorize(C, 'CREATE'), async (req, res) => {
  const d = parse(shape({ to: 's', body: 's', leadId: 'id?', customerId: 'id?' }), req.body)
  const m = await prisma.message.create({ data: { organizationId: req.user.organizationId, channel: 'WHATSAPP', direction: 'OUTBOUND', fromAddress: req.user.name, toAddress: d.to, body: d.body, status: 'SENT', sentAt: new Date(), sentById: req.user.id, leadId: d.leadId ?? null, customerId: d.customerId ?? null } })
  res.status(201).json(m)
})
communicationRouter.use('/templates', crud({
  model: 'messageTemplate', module: C, label: 'Template', orderBy: [{ channel: 'asc' }, { name: 'asc' }],
  fields: { channel: ['EMAIL', 'WHATSAPP', 'SMS'], key: 's', name: 's', subject: 's?', body: 's', 'isActive?': 'b' },
  beforeCreate: (d) => { d.variables = [] },
}))
