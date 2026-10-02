// Documents, HR, assets and finance.
import { Router, type Request } from 'express'
import { authorize, can, fullName } from '../core/auth.js'
import { crud, paging } from '../core/crud.js'
import { bad, conflict, forbidden, isUuid, notFound, parse, shape, stripNulls } from '../core/http.js'
import { activity, addDays, audit, dateOnly, daysBetween, notify, today, todayStr, U, usersWith, ymd } from '../core/util.js'
import { prisma } from '../db.js'
import * as E from '../generated/prisma/enums.js'
import { saveFile, upload } from './shared.js'

// ── Documents ──
export const documentsRouter = Router()
const docInclude = { customer: { select: { id: true, name: true } }, project: { select: { id: true, name: true } }, employee: { select: { id: true, firstName: true, lastName: true } }, owner: U, versions: { orderBy: { version: 'desc' as const }, include: { file: true } } }
const docWhere = (req: Request) => ({ organizationId: req.user.organizationId, deletedAt: null, ...(can(req.user, 'HR', 'VIEW') ? {} : { category: { not: 'HR_FILE' as const } }) })

documentsRouter.get('/', authorize('DOCUMENTS', 'VIEW'), async (req, res) => {
  const where: any = docWhere(req)
  for (const f of ['category', 'customerId', 'projectId', 'employeeId'] as const) if (typeof req.query[f] === 'string' && req.query[f]) where[f] = req.query[f]
  const q = String(req.query.q ?? '').trim()
  if (q) where.title = { contains: q, mode: 'insensitive' }
  const [items, total] = await Promise.all([prisma.document.findMany({ where, include: docInclude, orderBy: { updatedAt: 'desc' }, ...paging(req) }), prisma.document.count({ where })])
  res.json({ items, total })
})
documentsRouter.post('/', authorize('DOCUMENTS', 'CREATE'), upload.single('file'), async (req, res) => {
  if (!req.file) throw bad('Choose a file to upload')
  const d = stripNulls(parse(shape({ title: 's', category: Object.values(E.DocumentCategory), description: 's?', customerId: 'id?', projectId: 'id?', employeeId: 'id?', expiresAt: 'd?' }), req.body))
  if (d.category === 'HR_FILE' && !can(req.user, 'HR', 'VIEW')) throw forbidden('Only HR can add HR files')
  const doc = await prisma.$transaction(async (tx) => {
    const file = await saveFile(tx, req, req.file!)
    const row = await tx.document.create({ data: { ...d, organizationId: req.user.organizationId, ownerId: req.user.id, versions: { create: { version: 1, fileId: file.id, uploadedById: req.user.id } } }, include: docInclude })
    await audit(tx, req, 'CREATE', 'DOCUMENTS', 'Document', row.id, null, { title: row.title })
    return row
  })
  res.status(201).json(doc)
})
documentsRouter.post('/:id/versions', authorize('DOCUMENTS', 'CREATE'), upload.single('file'), async (req, res) => {
  if (!req.file) throw bad('Choose a file to upload')
  const doc = isUuid(req.params.id) ? await prisma.document.findFirst({ where: { ...docWhere(req), id: String(req.params.id) } }) : null
  if (!doc) throw notFound('Document')
  const row = await prisma.$transaction(async (tx) => {
    const file = await saveFile(tx, req, req.file!)
    const version = doc.currentVersion + 1
    await tx.documentVersion.create({ data: { documentId: doc.id, version, fileId: file.id, changeNote: String(req.body?.changeNote ?? '').slice(0, 500) || null, uploadedById: req.user.id } })
    await audit(tx, req, 'UPDATE', 'DOCUMENTS', 'Document', doc.id, { version: doc.currentVersion }, { version })
    return tx.document.update({ where: { id: doc.id }, data: { currentVersion: version }, include: docInclude })
  })
  res.status(201).json(row)
})
documentsRouter.delete('/:id', authorize('DOCUMENTS', 'DELETE'), async (req, res) => {
  const doc = isUuid(req.params.id) ? await prisma.document.findFirst({ where: { ...docWhere(req), id: String(req.params.id) } }) : null
  if (!doc) throw notFound('Document')
  await prisma.document.update({ where: { id: doc.id }, data: { deletedAt: new Date() } })
  res.status(204).end()
})

// ── HR ──
export const hrRouter = Router()
const HR = 'HR'
hrRouter.use('/employees', crud({
  model: 'employee', module: HR, label: 'Employee', number: ['employeeCode', 'EMPLOYEE'], orderBy: { firstName: 'asc' }, search: ['firstName', 'lastName', 'employeeCode', 'designation'], filters: ['status', 'departmentId'],
  fields: { firstName: 's', lastName: 's?', designation: 's', 'employmentType?': Object.values(E.EmploymentType), dateOfJoining: 'd', dateOfBirth: 'd?', gender: 's?', personalEmail: 's?', phone: 's?', address: 's?', departmentId: 'id?', branchId: 'id?', ctcAnnual: 'n?', 'status?': Object.values(E.EmployeeStatus), exitDate: 'd?', reportingManagerId: 'id?' },
  include: { department: { select: { id: true, name: true } }, user: { select: { id: true, email: true, status: true } }, reportingManager: { select: { id: true, firstName: true, lastName: true } } },
}))
hrRouter.use('/holidays', crud({ model: 'holiday', module: HR, label: 'Holiday', orderBy: { date: 'asc' }, dateField: 'date', fields: { name: 's', date: 'd', branchId: 'id?', 'isOptional?': 'b' } }))
hrRouter.use('/leave-types', crud({ model: 'leaveType', module: HR, label: 'Leave type', orderBy: { name: 'asc' }, fields: { name: 's', code: 's', 'annualQuota?': 'n', 'isPaid?': 'b', 'carryForward?': 'b' } }))
hrRouter.use('/reviews', crud({
  model: 'performanceReview', module: HR, label: 'Review', ownerField: 'reviewerId', filters: ['employeeId', 'status'],
  fields: { employeeId: 'id', periodStart: 'd', periodEnd: 'd', rating: 'n?', strengths: 's?', improvements: 's?', 'status?': Object.values(E.ReviewStatus) },
  include: { employee: { select: { id: true, firstName: true, lastName: true, designation: true } }, reviewer: U },
  beforeUpdate: (d, before) => { if (d.status === 'SUBMITTED' && before.status !== 'SUBMITTED') d.submittedAt = new Date() },
}))

hrRouter.get('/attendance', authorize(HR, 'VIEW'), async (req, res) => {
  const date = dateOnly(typeof req.query.date === 'string' && req.query.date ? req.query.date.slice(0, 10) : todayStr())
  const employees = await prisma.employee.findMany({ where: { organizationId: req.user.organizationId, status: { not: 'EXITED' } }, include: { department: { select: { name: true } }, attendances: { where: { date } } }, orderBy: { firstName: 'asc' } })
  res.json({ date, items: employees.map(({ attendances, ...e }) => ({ ...e, attendance: attendances[0] ?? null })) })
})
hrRouter.get('/attendance/month', authorize(HR, 'VIEW'), async (req, res) => {
  const month = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : todayStr().slice(0, 7)
  const from = dateOnly(`${month}-01`)
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0))
  const rows = await prisma.attendance.groupBy({ by: ['employeeId', 'status'], where: { organizationId: req.user.organizationId, date: { gte: from, lte: to } }, _count: true })
  res.json({ month, items: rows.map((r) => ({ employeeId: r.employeeId, status: r.status, days: r._count })) })
})
hrRouter.put('/attendance', authorize(HR, 'EDIT'), async (req, res) => {
  const d = parse(shape({ employeeId: 'id', date: 'd', status: Object.values(E.AttendanceStatus), notes: 's?' }), req.body)
  const emp = await prisma.employee.findFirst({ where: { id: d.employeeId, organizationId: req.user.organizationId } })
  if (!emp) throw notFound('Employee')
  const row = await prisma.attendance.upsert({
    where: { employeeId_date: { employeeId: emp.id, date: d.date } },
    create: { organizationId: emp.organizationId, employeeId: emp.id, date: d.date, status: d.status, notes: d.notes ?? null, source: 'MANUAL' },
    update: { status: d.status, notes: d.notes ?? null, source: 'MANUAL' },
  })
  res.json(row)
})

const leaveInclude = { employee: { select: { id: true, firstName: true, lastName: true, userId: true } }, leaveType: true, approver: U }
hrRouter.get('/leave-requests', authorize(HR, 'VIEW'), async (req, res) => {
  const where: any = { organizationId: req.user.organizationId }
  if (typeof req.query.status === 'string' && req.query.status) where.status = req.query.status
  const [items, total] = await Promise.all([prisma.leaveRequest.findMany({ where, include: leaveInclude, orderBy: { createdAt: 'desc' }, ...paging(req) }), prisma.leaveRequest.count({ where })])
  res.json({ items, total })
})
async function createLeave(req: Request, employeeId: string, d: any) {
  if (d.endDate < d.startDate) throw bad('The end date is before the start date')
  const days = daysBetween(d.endDate, d.startDate) + 1
  if (days > 60) throw bad('A single request can cover at most 60 days')
  const organizationId = req.user.organizationId
  return prisma.$transaction(async (tx) => {
    const row = await tx.leaveRequest.create({ data: { organizationId, employeeId, leaveTypeId: d.leaveTypeId, startDate: d.startDate, endDate: d.endDate, days, reason: d.reason ?? null }, include: leaveInclude })
    for (const uid of await usersWith(tx, organizationId, HR, 'APPROVE')) if (uid !== req.user.id) await notify(tx, organizationId, uid, 'leave.requested', `Leave request from ${fullName(row.employee)}`, '/hr')
    return row
  })
}
const leaveSpec = { leaveTypeId: 'id', startDate: 'd', endDate: 'd', reason: 's?' } as const
hrRouter.post('/leave-requests', authorize(HR, 'CREATE'), async (req, res) => {
  const d = parse(shape({ ...leaveSpec, employeeId: 'id' }), req.body)
  res.status(201).json(await createLeave(req, d.employeeId, d))
})
hrRouter.post('/leave-requests/:id/:decision', authorize(HR, 'APPROVE'), async (req, res) => {
  const decision = req.params.decision === 'approve' ? 'APPROVED' : req.params.decision === 'reject' ? 'REJECTED' : null
  const lr = decision && isUuid(req.params.id) ? await prisma.leaveRequest.findFirst({ where: { id: String(req.params.id), organizationId: req.user.organizationId }, include: leaveInclude }) : null
  if (!lr || !decision) throw notFound('Leave request')
  if (lr.status !== 'PENDING') throw conflict('This request has already been decided')
  const row = await prisma.$transaction(async (tx) => {
    const u = await tx.leaveRequest.update({ where: { id: lr.id }, data: { status: decision, approverId: req.user.id, decidedAt: new Date() }, include: leaveInclude })
    if (decision === 'APPROVED') {
      for (let day = new Date(lr.startDate); day <= lr.endDate; day = addDays(day, 1)) {
        await tx.attendance.upsert({ where: { employeeId_date: { employeeId: lr.employeeId, date: day } }, create: { organizationId: lr.organizationId, employeeId: lr.employeeId, date: day, status: 'ON_LEAVE', source: 'MANUAL' }, update: { status: 'ON_LEAVE' } })
      }
    }
    if (lr.employee.userId && lr.employee.userId !== req.user.id) await notify(tx, lr.organizationId, lr.employee.userId, 'leave.decided', `Your leave request was ${decision.toLowerCase()}`, '/profile')
    await audit(tx, req, decision === 'APPROVED' ? 'APPROVE' : 'REJECT', HR, 'LeaveRequest', lr.id, { status: lr.status }, { status: decision })
    return u
  })
  res.json(row)
})

/** Self-service for every signed-in user: own attendance and leave, whatever their HR permissions. */
export const meRouter = Router()
const myEmployee = (req: Request) => {
  if (!req.user.employeeId) throw conflict('No employee profile is linked to your login. Ask HR to add one.')
  return req.user.employeeId
}
meRouter.get('/hr', async (req, res) => {
  if (!req.user.employeeId) return res.json({ employee: null })
  const employeeId = req.user.employeeId
  const year = Number(todayStr().slice(0, 4))
  const [employee, attendance, leaveRequests, leaveTypes, used] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId }, include: { department: { select: { name: true } } } }),
    prisma.attendance.findUnique({ where: { employeeId_date: { employeeId, date: today() } } }),
    prisma.leaveRequest.findMany({ where: { employeeId }, include: { leaveType: true }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.leaveType.findMany({ where: { organizationId: req.user.organizationId }, orderBy: { name: 'asc' } }),
    prisma.leaveRequest.groupBy({ by: ['leaveTypeId'], where: { employeeId, status: 'APPROVED', startDate: { gte: dateOnly(`${year}-01-01`) } }, _sum: { days: true } }),
  ])
  res.json({ employee, attendance, leaveRequests, leaveTypes: leaveTypes.map((t) => ({ ...t, used: Number(used.find((u) => u.leaveTypeId === t.id)?._sum.days ?? 0) })) })
})
meRouter.post('/check-in', async (req, res) => {
  const employeeId = myEmployee(req)
  const status = req.body?.workFromHome ? 'WORK_FROM_HOME' : 'PRESENT'
  const row = await prisma.attendance.upsert({
    where: { employeeId_date: { employeeId, date: today() } },
    create: { organizationId: req.user.organizationId, employeeId, date: today(), status, checkInAt: new Date(), source: 'WEB' },
    update: { status, checkInAt: new Date(), checkOutAt: null, workMinutes: null },
  })
  res.json(row)
})
meRouter.post('/check-out', async (req, res) => {
  const employeeId = myEmployee(req)
  const a = await prisma.attendance.findUnique({ where: { employeeId_date: { employeeId, date: today() } } })
  if (!a?.checkInAt) throw conflict('Check in first')
  res.json(await prisma.attendance.update({ where: { id: a.id }, data: { checkOutAt: new Date(), workMinutes: Math.max(0, Math.round((Date.now() - a.checkInAt.getTime()) / 60000)) } }))
})
meRouter.post('/leave-requests', async (req, res) => {
  res.status(201).json(await createLeave(req, myEmployee(req), parse(shape(leaveSpec), req.body)))
})

// ── Assets ──
export const assetsRouter = Router()
const assetFind = async (req: Request) => {
  const a = isUuid(req.params.id) ? await prisma.asset.findFirst({ where: { id: String(req.params.id), organizationId: req.user.organizationId } }) : null
  if (!a) throw notFound('Asset')
  return a
}
assetsRouter.post('/:id/assign', authorize('ASSETS', 'EDIT'), async (req, res) => {
  const d = parse(shape({ employeeId: 'id', conditionOnAssign: 's?' }), req.body)
  const a = await assetFind(req)
  await prisma.$transaction(async (tx) => {
    await tx.assetAssignment.updateMany({ where: { assetId: a.id, returnedAt: null }, data: { returnedAt: new Date() } })
    await tx.assetAssignment.create({ data: { assetId: a.id, employeeId: d.employeeId, conditionOnAssign: d.conditionOnAssign ?? null, assignedById: req.user.id } })
    await tx.asset.update({ where: { id: a.id }, data: { status: 'ASSIGNED' } })
    await activity(tx, a.organizationId, 'ASSET', a.id, 'ASSIGNED', 'Asset assigned', req.user.id)
  })
  res.status(204).end()
})
assetsRouter.post('/:id/return', authorize('ASSETS', 'EDIT'), async (req, res) => {
  const d = parse(shape({ conditionOnReturn: 's?' }), req.body)
  const a = await assetFind(req)
  await prisma.$transaction(async (tx) => {
    await tx.assetAssignment.updateMany({ where: { assetId: a.id, returnedAt: null }, data: { returnedAt: new Date(), conditionOnReturn: d.conditionOnReturn ?? null } })
    await tx.asset.update({ where: { id: a.id }, data: { status: 'AVAILABLE' } })
    await activity(tx, a.organizationId, 'ASSET', a.id, 'UPDATED', 'Asset returned', req.user.id)
  })
  res.status(204).end()
})
assetsRouter.get('/:id/history', authorize('ASSETS', 'VIEW'), async (req, res) => {
  const a = await assetFind(req)
  const [assignments, maintenance] = await Promise.all([
    prisma.assetAssignment.findMany({ where: { assetId: a.id }, include: { employee: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { assignedAt: 'desc' } }),
    prisma.assetMaintenance.findMany({ where: { assetId: a.id }, orderBy: { performedAt: 'desc' } }),
  ])
  res.json({ assignments, maintenance })
})
assetsRouter.post('/:id/maintenance', authorize('ASSETS', 'EDIT'), async (req, res) => {
  const d = stripNulls(parse(shape({ type: 's', description: 's', vendorName: 's?', cost: 'n?', performedAt: 'd', nextDueAt: 'd?' }), req.body))
  const a = await assetFind(req)
  res.status(201).json(await prisma.assetMaintenance.create({ data: { ...d, assetId: a.id } }))
})
assetsRouter.use('/', crud({
  model: 'asset', module: 'ASSETS', label: 'Asset', number: ['assetTag', 'ASSET'], orderBy: { assetTag: 'asc' }, search: ['name', 'assetTag', 'serialNumber'], filters: ['status', 'category'],
  fields: { name: 's', category: Object.values(E.AssetCategory), serialNumber: 's?', vendorName: 's?', purchaseDate: 'd?', purchaseCost: 'n?', warrantyExpiresAt: 'd?', condition: 's?', notes: 's?', 'status?': Object.values(E.AssetStatus) },
  include: { assignments: { where: { returnedAt: null }, include: { employee: { select: { id: true, firstName: true, lastName: true } } } } },
}))

// ── Finance ──
export const financeRouter = Router()
const F = 'FINANCE'
financeRouter.use('/vendors', crud({ model: 'vendor', module: F, label: 'Vendor', orderBy: { name: 'asc' }, search: ['name'], fields: { name: 's', gstin: 's?', email: 's?', phone: 's?', notes: 's?' } }))
financeRouter.use('/expense-categories', crud({ model: 'expenseCategory', module: F, label: 'Category', orderBy: { name: 'asc' }, fields: { name: 's', parentId: 'id?' } }))

financeRouter.post('/expenses/:id/:decision', authorize(F, 'APPROVE'), async (req, res) => {
  const decision = req.params.decision === 'approve' ? 'APPROVED' : req.params.decision === 'reject' ? 'REJECTED' : null
  const x = decision && isUuid(req.params.id) ? await prisma.expense.findFirst({ where: { id: String(req.params.id), organizationId: req.user.organizationId }, include: { category: true } }) : null
  if (!x || !decision) throw notFound('Expense')
  if (x.status !== 'SUBMITTED' && x.status !== 'DRAFT') throw conflict('This expense has already been decided')
  const row = await prisma.$transaction(async (tx) => {
    const u = await tx.expense.update({ where: { id: x.id }, data: { status: decision, updatedById: req.user.id } })
    if (decision === 'APPROVED') await tx.ledgerEntry.create({ data: { organizationId: x.organizationId, entryDate: x.expenseDate, type: 'EXPENSE', amount: Number(x.amount) + Number(x.taxAmount), bankAccountId: x.bankAccountId, sourceType: 'EXPENSE', sourceId: x.id, description: `${x.category.name}: ${x.description}`.slice(0, 300) } })
    if (x.createdById && x.createdById !== req.user.id) await notify(tx, x.organizationId, x.createdById, 'expense.decided', `Expense ${x.expenseNumber} was ${decision.toLowerCase()}`, '/finance')
    await audit(tx, req, decision === 'APPROVED' ? 'APPROVE' : 'REJECT', F, 'Expense', x.id, { status: x.status }, { status: decision })
    return u
  })
  res.json(row)
})
financeRouter.use('/expenses', crud({
  model: 'expense', module: F, label: 'Expense', by: true, number: ['expenseNumber', 'EXPENSE'], orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }], dateField: 'expenseDate',
  fields: { categoryId: 'id', vendorId: 'id?', projectId: 'id?', campaignId: 'id?', expenseDate: 'd', amount: 'n', 'taxAmount?': 'n', description: 's', 'paymentMethod?': Object.values(E.PaymentMethod), bankAccountId: 'id?', paidById: 'id?', 'isReimbursable?': 'b' },
  search: ['description', 'expenseNumber', 'vendor.name'], filters: ['status', 'categoryId', 'projectId'],
  include: { category: true, vendor: { select: { id: true, name: true } }, paidBy: U, project: { select: { id: true, name: true } } },
  beforeCreate: (d) => { d.status = 'SUBMITTED' },
  afterCreate: async (row, req, tx) => {
    for (const uid of await usersWith(tx, row.organizationId, F, 'APPROVE')) if (uid !== req.user.id) await notify(tx, row.organizationId, uid, 'expense.submitted', `Expense waiting for approval: ${row.description}`.slice(0, 200), '/finance')
  },
  beforeUpdate: (_d, before) => { if (before.status === 'APPROVED' || before.status === 'PAID') throw conflict('An approved expense cannot be edited. Delete it and add it again.') },
  beforeDelete: async (before, _req, tx) => { await tx.ledgerEntry.deleteMany({ where: { sourceType: 'EXPENSE', sourceId: before.id } }) },
}))

financeRouter.get('/summary', authorize(F, 'VIEW'), async (req, res) => {
  const organizationId = req.user.organizationId
  const months = Math.min(Math.max(Number(req.query.months) || 6, 1), 24)
  const t = today()
  const from = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - (months - 1), 1))
  const [entries, receivables, byCategory, categories] = await Promise.all([
    prisma.ledgerEntry.findMany({ where: { organizationId, entryDate: { gte: from } }, select: { entryDate: true, type: true, amount: true } }),
    prisma.invoice.aggregate({ where: { organizationId, deletedAt: null, status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'] } }, _sum: { balanceDue: true } }),
    prisma.expense.groupBy({ by: ['categoryId'], where: { organizationId, expenseDate: { gte: from }, status: { in: ['APPROVED', 'PAID'] } }, _sum: { amount: true, taxAmount: true } }),
    prisma.expenseCategory.findMany({ where: { organizationId } }),
  ])
  const rows = Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1))
    return { month: ymd(d).slice(0, 7), income: 0, expense: 0 }
  })
  for (const e of entries) {
    const r = rows.find((x) => x.month === ymd(e.entryDate).slice(0, 7))
    if (r) r[e.type === 'INCOME' ? 'income' : 'expense'] += Number(e.amount)
  }
  res.json({
    months: rows.map((r) => ({ ...r, net: r.income - r.expense })),
    receivables: Number(receivables._sum.balanceDue ?? 0),
    byCategory: byCategory.map((c) => ({ name: categories.find((x) => x.id === c.categoryId)?.name ?? 'Other', amount: Number(c._sum.amount ?? 0) + Number(c._sum.taxAmount ?? 0) })).sort((a, b) => b.amount - a.amount),
  })
})
