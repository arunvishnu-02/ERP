// One inbox for everything waiting on a decision: quotations, leave and expenses.
import { can, scopeIds } from '../core/auth'
import { Router, type Request } from '../core/router'
import { scoped, U } from '../core/util'
import { prisma } from '../db'

export const approvalsRouter = Router()

const party = { customer: { select: { name: true } }, lead: { select: { firstName: true, lastName: true, companyName: true } } }
const leaveInclude = { employee: { select: { id: true, firstName: true, lastName: true, userId: true } }, leaveType: { select: { name: true, isPaid: true } } }
const expenseInclude = { category: { select: { name: true } }, vendor: { select: { name: true } }, project: { select: { name: true } }, paidBy: U }

/** The people whose requests this user may decide in a module, or null for everyone. */
async function whose(req: Request, module: string) {
  const s = can(req.user, module, 'APPROVE')
  return s ? { ids: await scopeIds(req.user, s) } : null
}

approvalsRouter.get('/', async (req, res) => {
  const organizationId = req.user.organizationId
  const out: Record<string, any[]> = { quotations: [], leave: [], expenses: [] }
  const q = await scoped(req, 'QUOTATIONS', 'APPROVE')
  if (q) {
    out.quotations = await prisma.quotation.findMany({
      where: { organizationId, deletedAt: null, isLatest: true, status: 'PENDING_APPROVAL', AND: [q] },
      select: { id: true, quotationNumber: true, title: true, totalAmount: true, discountTotal: true, subtotal: true, updatedAt: true, preparedBy: U, ...party },
      orderBy: { updatedAt: 'asc' },
    })
  }
  const hr = await whose(req, 'HR')
  if (hr) {
    out.leave = await prisma.leaveRequest.findMany({
      where: { organizationId, status: 'PENDING', ...(hr.ids ? { employee: { userId: { in: hr.ids } } } : {}) },
      include: leaveInclude, orderBy: { createdAt: 'asc' },
    })
  }
  const fin = await whose(req, 'FINANCE')
  if (fin) {
    out.expenses = await prisma.expense.findMany({
      where: { organizationId, status: 'SUBMITTED', ...(fin.ids ? { createdById: { in: fin.ids } } : {}) },
      include: expenseInclude, orderBy: { createdAt: 'asc' },
    })
  }
  // who sent each expense: the table keeps only the id
  const senders = await prisma.user.findMany({ where: { id: { in: out.expenses.map((x) => x.createdById).filter(Boolean) } }, select: U.select })
  out.expenses = out.expenses.map((x) => ({ ...x, createdBy: senders.find((u) => u.id === x.createdById) ?? null }))
  // never ask people to decide their own requests
  out.quotations = out.quotations.filter((x) => x.preparedBy?.id !== req.user.id)
  out.leave = out.leave.filter((x) => x.employee.userId !== req.user.id)
  out.expenses = out.expenses.filter((x) => x.createdById !== req.user.id)

  const since = new Date(Date.now() - 60 * 864e5)
  const [myQuotes, myLeave, myExpenses] = await Promise.all([
    prisma.quotation.findMany({ where: { organizationId, deletedAt: null, isLatest: true, preparedById: req.user.id, status: { in: ['PENDING_APPROVAL', 'APPROVED', 'REJECTED'] }, updatedAt: { gte: since } }, select: { id: true, quotationNumber: true, status: true, totalAmount: true, rejectionNote: true, updatedAt: true, ...party }, orderBy: { updatedAt: 'desc' }, take: 10 }),
    req.user.employeeId ? prisma.leaveRequest.findMany({ where: { employeeId: req.user.employeeId, createdAt: { gte: since } }, include: { leaveType: { select: { name: true } }, approver: U }, orderBy: { createdAt: 'desc' }, take: 10 }) : [],
    prisma.expense.findMany({ where: { organizationId, createdById: req.user.id, status: { in: ['SUBMITTED', 'APPROVED', 'REJECTED'] }, updatedAt: { gte: since } }, include: { category: { select: { name: true } } }, orderBy: { updatedAt: 'desc' }, take: 10 }),
  ])
  res.json({
    waiting: out,
    count: out.quotations.length + out.leave.length + out.expenses.length,
    canDecide: { quotations: !!q, leave: !!hr, expenses: !!fin },
    mine: { quotations: myQuotes, leave: myLeave, expenses: myExpenses },
  })
})

/** Only the number, for the badge in the menu. */
approvalsRouter.get('/count', async (req, res) => {
  const organizationId = req.user.organizationId
  let n = 0
  const q = await scoped(req, 'QUOTATIONS', 'APPROVE')
  if (q) n += await prisma.quotation.count({ where: { organizationId, deletedAt: null, isLatest: true, status: 'PENDING_APPROVAL', preparedById: { not: req.user.id }, AND: [q] } })
  const hr = await whose(req, 'HR')
  if (hr) n += await prisma.leaveRequest.count({ where: { organizationId, status: 'PENDING', employee: { ...(hr.ids ? { userId: { in: hr.ids } } : {}), OR: [{ userId: null }, { userId: { not: req.user.id } }] } } })
  const fin = await whose(req, 'FINANCE')
  if (fin) n += await prisma.expense.count({ where: { organizationId, status: 'SUBMITTED', ...(fin.ids ? { createdById: { in: fin.ids } } : {}), NOT: { createdById: req.user.id } } })
  res.json({ count: n })
})
