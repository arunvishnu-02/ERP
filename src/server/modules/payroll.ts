// Payroll: monthly salary runs, payslips, payroll settings and the appointment letter data.
// No PF, ESI, professional tax or TDS is taken by default. HR can add deductions by hand on any payslip.
import { z } from 'zod'
import { Router, type Request } from '../core/router'
import { authorize, fullName } from '../core/auth'
import { bad, conflict, notFound, isUuid, parse, shape } from '../core/http'
import { addDays, audit, dateOnly, notify, todayStr, ymd } from '../core/util'
import { prisma, type Tx } from '../db'
import { Prisma } from '../../generated/prisma/client'

const HR = 'HR'
type Line = { name: string; amount: number }

const DEFAULT_SPLIT = [{ name: 'Basic salary', percent: 50 }, { name: 'House rent allowance', percent: 20 }, { name: 'Special allowance', percent: 30 }]

const DEFAULT_TERMS = [
  'Office timings and weekly off days are as fixed by the company. Please be on time and mark your attendance every working day.',
  'Leave must be applied for and approved in advance, except in an emergency. Leave without approval is treated as loss of pay.',
  'Salary is paid monthly into your bank account. Loss of pay days are deducted at the daily rate.',
  'Either side may end the employment by giving the notice period in writing, or salary in place of the notice.',
  'Company and client information, passwords, source code and designs are confidential, during and after your employment.',
  'All work created for the company or its clients belongs to the company.',
  'Company property such as laptops, ID cards and access must be looked after and returned on the last working day.',
  'Treat colleagues and clients with respect. Harassment, misuse of company property or dishonesty may lead to dismissal.',
  'Tell HR in writing about any change in your address, phone number or bank details.',
].join('\n')

/** Payroll settings kept in Organization.settings.payroll, with the defaults filled in. */
export function payrollSettings(settings: any) {
  const p = settings?.payroll ?? {}
  return {
    split: (Array.isArray(p.split) && p.split.length ? p.split : DEFAULT_SPLIT) as { name: string; percent: number }[],
    weeklyOff: (Array.isArray(p.weeklyOff) ? p.weeklyOff : [0]) as number[], // 0 is Sunday
    payDay: (p.payDay ?? null) as number | null,
    probationMonths: (p.probationMonths ?? null) as number | null,
    noticeMonths: (p.noticeMonths ?? 3) as number,
    workHours: (p.workHours ?? null) as string | null,
    terms: (p.terms || DEFAULT_TERMS) as string, // one rule per line, printed on the joining form
  }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
const monthRange = (m: string) => {
  const from = dateOnly(`${m}-01`)
  return { from, to: new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0)) }
}
const sum = (lines: Line[] | null | undefined) => (lines ?? []).reduce((n, l) => n + Number(l.amount || 0), 0)
const round2 = (n: number) => Math.round(n * 100) / 100

/** Working days between two dates (both included): not a weekly off day and not an office holiday. */
function workingDates(from: Date, to: Date, weeklyOff: number[], holidays: Set<string>) {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) if (!weeklyOff.includes(d.getUTCDay()) && !holidays.has(ymd(d))) out.push(ymd(d))
  return out
}

/** Splits the salary for the days paid across the salary parts. The last part takes the rounding so the total is exact. */
function earningsFor(monthly: number, paidDays: number, monthDays: number, split: { name: string; percent: number }[]): Line[] {
  const total = monthDays > 0 ? Math.round((monthly * paidDays) / monthDays) : 0
  let left = total
  return split.map((c, i) => {
    const amount = i === split.length - 1 ? left : Math.round((total * c.percent) / 100)
    left -= amount
    return { name: c.name, amount }
  })
}

function totals(earnings: Line[], extra: Line[] | null, deductions: Line[] | null) {
  const gross = sum(earnings) + sum(extra)
  const totalDeductions = sum(deductions)
  if (totalDeductions > gross) throw bad('Deductions cannot be more than the gross pay')
  return { gross: round2(gross), totalDeductions: round2(totalDeductions), netPay: round2(gross - totalDeductions) }
}

/** Works out every payslip of a draft run from salaries, holidays, unpaid leave and absences. Keeps HR's own lines. */
async function calculate(tx: Tx, organizationId: string, runId: string, month: string) {
  const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId } })
  const s = payrollSettings(org.settings)
  const { from, to } = monthRange(month)
  const [employees, holidays, leaves, absences, existing] = await Promise.all([
    tx.employee.findMany({ where: { organizationId, dateOfJoining: { lte: to }, OR: [{ exitDate: null, status: { not: 'EXITED' } }, { exitDate: { gte: from } }] }, orderBy: { firstName: 'asc' } }),
    tx.holiday.findMany({ where: { organizationId, isOptional: false, date: { gte: from, lte: to } } }),
    tx.leaveRequest.findMany({ where: { organizationId, status: 'APPROVED', leaveType: { isPaid: false }, startDate: { lte: to }, endDate: { gte: from } } }),
    tx.attendance.findMany({ where: { organizationId, status: 'ABSENT', date: { gte: from, lte: to } } }),
    tx.payslip.findMany({ where: { runId } }),
  ])
  const holidaySet = (branchId: string | null) => new Set(holidays.filter((h) => !h.branchId || h.branchId === branchId).map((h) => ymd(h.date)))
  const monthWorking = workingDates(from, to, s.weeklyOff, holidaySet(null)).length
  const skipped: string[] = []
  const keep: string[] = []
  for (const e of employees) {
    const ctc = Number(e.ctcAnnual ?? 0)
    if (ctc <= 0) { skipped.push(fullName(e)); continue }
    const start = e.dateOfJoining > from ? e.dateOfJoining : from
    const end = e.exitDate && e.exitDate < to ? e.exitDate : to
    if (start > end) continue
    const hs = holidaySet(e.branchId)
    const mine = workingDates(start, end, s.weeklyOff, hs)
    const off = new Set<string>()
    for (const l of leaves.filter((l) => l.employeeId === e.id)) for (let d = l.startDate; d <= l.endDate; d = addDays(d, 1)) off.add(ymd(d))
    for (const a of absences.filter((a) => a.employeeId === e.id)) off.add(ymd(a.date))
    const lopDays = mine.filter((d) => off.has(d)).length
    const monthDays = workingDates(from, to, s.weeklyOff, hs).length
    const monthly = round2(ctc / 12)
    const earnings = earningsFor(monthly, mine.length - lopDays, monthDays, s.split)
    const before = existing.find((p) => p.employeeId === e.id)
    const extra = (before?.extraEarnings as Line[] | null) ?? null
    const deductions = (before?.deductions as Line[] | null) ?? null
    const data = { monthlySalary: monthly, workingDays: mine.length, paidDays: mine.length - lopDays, lopDays, earnings, ...totals(earnings, extra, deductions) }
    keep.push(e.id)
    if (before) await tx.payslip.update({ where: { id: before.id }, data })
    else await tx.payslip.create({ data: { ...data, organizationId, runId, employeeId: e.id, month } })
  }
  await tx.payslip.deleteMany({ where: { runId, employeeId: { notIn: keep } } })
  await refreshTotals(tx, runId, monthWorking)
  return skipped
}

async function refreshTotals(tx: Tx, runId: string, workingDays?: number) {
  const t = await tx.payslip.aggregate({ where: { runId }, _sum: { gross: true, totalDeductions: true, netPay: true } })
  await tx.payrollRun.update({ where: { id: runId }, data: { totalGross: t._sum.gross ?? 0, totalDeductions: t._sum.totalDeductions ?? 0, totalNet: t._sum.netPay ?? 0, ...(workingDays === undefined ? {} : { workingDays }) } })
}

const emp = { select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: true, userId: true, phone: true, department: { select: { name: true } } } }
const findRun = async (req: Request) => {
  const run = isUuid(req.params.id) ? await prisma.payrollRun.findFirst({ where: { id: String(req.params.id), organizationId: req.user.organizationId } }) : null
  if (!run) throw notFound('Payroll run')
  return run
}

/** One payslip with what the printed page needs: the person, the run, totals for the financial year so far and leave left. */
async function payslipView(organizationId: string, id: string, employeeId?: string) {
  const p = isUuid(id) ? await prisma.payslip.findFirst({
    where: { id, organizationId, ...(employeeId ? { employeeId, run: { status: { not: 'DRAFT' } } } : {}) },
    include: { run: { select: { id: true, status: true, paidOn: true, workingDays: true } }, employee: { include: { department: { select: { name: true } }, branch: { select: { name: true } } } } },
  }) : null
  if (!p) throw notFound('Payslip')
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { financialYearStartMonth: true } })
  const fy = org.financialYearStartMonth
  const y = Number(p.month.slice(0, 4))
  const fyStart = `${Number(p.month.slice(5, 7)) >= fy ? y : y - 1}-${String(fy).padStart(2, '0')}`
  const year = y
  const [ytd, leaveTypes, used] = await Promise.all([
    prisma.payslip.aggregate({ where: { employeeId: p.employeeId, month: { gte: fyStart, lte: p.month }, OR: [{ id: p.id }, { run: { status: { not: 'DRAFT' } } }] }, _sum: { gross: true, totalDeductions: true, netPay: true } }),
    prisma.leaveType.findMany({ where: { organizationId, isPaid: true, annualQuota: { gt: 0 } }, orderBy: { name: 'asc' } }),
    prisma.leaveRequest.groupBy({ by: ['leaveTypeId'], where: { employeeId: p.employeeId, status: 'APPROVED', startDate: { gte: dateOnly(`${year}-01-01`), lte: monthRange(p.month).to } }, _sum: { days: true } }),
  ])
  const { panEncrypted, bankDetailsEncrypted, ...employee } = p.employee
  return {
    ...p, employee, monthName: monthName(p.month),
    ytd: { from: fyStart, gross: Number(ytd._sum.gross ?? 0), deductions: Number(ytd._sum.totalDeductions ?? 0), net: Number(ytd._sum.netPay ?? 0) },
    leave: leaveTypes.map((t) => { const u = Number(used.find((x) => x.leaveTypeId === t.id)?._sum.days ?? 0); return { name: t.name, allotted: Number(t.annualQuota), used: u, left: Math.max(0, Number(t.annualQuota) - u) } }),
  }
}

export const payrollRouter = Router()

payrollRouter.get('/settings', authorize(HR, 'VIEW'), async (req, res) => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.user.organizationId } })
  res.json(payrollSettings(org.settings))
})
const settingsSchema = z.object({
  split: z.array(z.object({ name: z.string().trim().min(1).max(60), percent: z.coerce.number().min(0).max(100) })).min(1).max(12),
  weeklyOff: z.array(z.number().int().min(0).max(6)).max(6),
  payDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
  probationMonths: z.coerce.number().int().min(0).max(24).nullable().optional(),
  noticeMonths: z.coerce.number().int().min(0).max(12),
  workHours: z.string().trim().max(120).nullable().optional(),
  terms: z.string().trim().max(5000).nullable().optional(),
})
payrollRouter.put('/settings', authorize(HR, 'EDIT'), async (req, res) => {
  const d = parse(settingsSchema, req.body)
  if (Math.abs(d.split.reduce((n: number, c: any) => n + c.percent, 0) - 100) > 0.001) throw bad('The salary parts must add up to 100%')
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.user.organizationId } })
  const payroll = { ...d, payDay: d.payDay ?? null, probationMonths: d.probationMonths ?? null, workHours: d.workHours || null, terms: d.terms || null }
  await prisma.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: org.id }, data: { settings: { ...((org.settings as any) ?? {}), payroll } } })
    await audit(tx, req, 'UPDATE', HR, 'PayrollSettings', org.id, payrollSettings(org.settings), payroll)
  })
  res.json(payrollSettings({ payroll }))
})

/** What the appointment letter says about the job, the pay and the leave. */
payrollRouter.get('/appointment/:employeeId', authorize(HR, 'VIEW'), async (req, res) => {
  const e = isUuid(req.params.employeeId) ? await prisma.employee.findFirst({
    where: { id: String(req.params.employeeId), organizationId: req.user.organizationId },
    include: { department: { select: { name: true } }, branch: { select: { name: true } }, reportingManager: { select: { firstName: true, lastName: true, designation: true } } },
  }) : null
  if (!e) throw notFound('Employee')
  const [org, leaveTypes] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: req.user.organizationId } }),
    prisma.leaveType.findMany({ where: { organizationId: req.user.organizationId, isPaid: true, annualQuota: { gt: 0 } }, orderBy: { name: 'asc' } }),
  ])
  const s = payrollSettings(org.settings)
  const monthly = round2(Number(e.ctcAnnual ?? 0) / 12)
  const salary = earningsFor(monthly, 1, 1, s.split).map((l) => ({ ...l, annual: l.amount * 12 }))
  const { panEncrypted, bankDetailsEncrypted, ...employee } = e
  res.json({ employee, settings: s, salary, monthly: sum(salary), annual: sum(salary) * 12, leaveTypes: leaveTypes.map((t) => ({ name: t.name, days: Number(t.annualQuota) })) })
})

/** The joining form: blank ("new") for someone to fill in by hand, or with an employee's details already in. */
payrollRouter.get('/joining/:employeeId', authorize(HR, 'VIEW'), async (req, res) => {
  const id = String(req.params.employeeId)
  const e = id === 'new' ? null : isUuid(id) ? await prisma.employee.findFirst({ where: { id, organizationId: req.user.organizationId }, include: { department: { select: { name: true } }, reportingManager: { select: { firstName: true, lastName: true } } } }) : undefined
  if (e === undefined) throw notFound('Employee')
  const [org, leaveTypes] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: req.user.organizationId } }),
    prisma.leaveType.findMany({ where: { organizationId: req.user.organizationId, isPaid: true, annualQuota: { gt: 0 } }, orderBy: { name: 'asc' } }),
  ])
  let employee: any = null
  if (e) { const { panEncrypted, bankDetailsEncrypted, ...rest } = e; employee = rest }
  res.json({ employee, settings: payrollSettings(org.settings), leaveTypes: leaveTypes.map((t) => ({ name: t.name, days: Number(t.annualQuota) })) })
})

payrollRouter.get('/', authorize(HR, 'VIEW'), async (req, res) => {
  const items = await prisma.payrollRun.findMany({ where: { organizationId: req.user.organizationId }, include: { _count: { select: { payslips: true } } }, orderBy: { month: 'desc' }, take: 36 })
  res.json({ items: items.map(({ _count, ...r }) => ({ ...r, monthName: monthName(r.month), people: _count.payslips })) })
})

payrollRouter.post('/', authorize(HR, 'CREATE'), async (req, res) => {
  const { month } = parse(shape({ month: 's' }), req.body)
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw bad('Choose a month')
  if (month > todayStr().slice(0, 7)) throw bad('You can only run payroll for this month or an earlier one')
  const organizationId = req.user.organizationId
  if (await prisma.payrollRun.findUnique({ where: { organizationId_month: { organizationId, month } } })) throw conflict(`Payroll for ${monthName(month)} has already been started`)
  const out = await prisma.$transaction(async (tx) => {
    const run = await tx.payrollRun.create({ data: { organizationId, month, workingDays: 0, createdById: req.user.id } })
    const skipped = await calculate(tx, organizationId, run.id, month)
    await audit(tx, req, 'CREATE', HR, 'PayrollRun', run.id, null, { month })
    return { id: run.id, skipped }
  }, { timeout: 30_000 })
  res.status(201).json({ ...(await runView(organizationId, out.id)), skipped: out.skipped })
})

async function runView(organizationId: string, id: string) {
  const run = await prisma.payrollRun.findFirstOrThrow({ where: { id, organizationId }, include: { payslips: { include: { employee: emp }, orderBy: { employee: { firstName: 'asc' } } } } })
  return { ...run, monthName: monthName(run.month) }
}
payrollRouter.get('/:id', authorize(HR, 'VIEW'), async (req, res) => {
  const run = await findRun(req)
  res.json(await runView(run.organizationId, run.id))
})

payrollRouter.post('/:id/recalculate', authorize(HR, 'EDIT'), async (req, res) => {
  const run = await findRun(req)
  if (run.status !== 'DRAFT') throw conflict('Only a draft can be recalculated. Reopen it first.')
  const skipped = await prisma.$transaction((tx) => calculate(tx, run.organizationId, run.id, run.month), { timeout: 30_000 })
  res.json({ ...(await runView(run.organizationId, run.id)), skipped })
})

const lines = z.array(z.object({ name: z.string().trim().min(1).max(80), amount: z.coerce.number().min(0).max(1e8) })).max(20).nullable().optional()
const payslipEdit = z.object({ lopDays: z.coerce.number().min(0).max(31).optional(), extraEarnings: lines, deductions: lines, notes: z.string().trim().max(500).nullable().optional() })
payrollRouter.patch('/payslips/:id', authorize(HR, 'EDIT'), async (req, res) => {
  const p = isUuid(req.params.id) ? await prisma.payslip.findFirst({ where: { id: String(req.params.id), organizationId: req.user.organizationId }, include: { run: true } }) : null
  if (!p) throw notFound('Payslip')
  if (p.run.status !== 'DRAFT') throw conflict('This payslip is finalised. Reopen the payroll to change it.')
  const d = parse(payslipEdit, req.body)
  const lopDays = d.lopDays ?? Number(p.lopDays)
  if (lopDays > Number(p.workingDays)) throw bad(`Loss of pay cannot be more than the ${Number(p.workingDays)} working days`)
  const extra = d.extraEarnings === undefined ? (p.extraEarnings as Line[] | null) : d.extraEarnings?.length ? d.extraEarnings : null
  const deductions = d.deductions === undefined ? (p.deductions as Line[] | null) : d.deductions?.length ? d.deductions : null
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: p.organizationId } })
  const s = payrollSettings(org.settings)
  // The month's working days for this person's branch, worked back from the full-month figure.
  const { from, to } = monthRange(p.month)
  const e = await prisma.employee.findUniqueOrThrow({ where: { id: p.employeeId } })
  const hs = new Set((await prisma.holiday.findMany({ where: { organizationId: p.organizationId, isOptional: false, date: { gte: from, lte: to }, OR: [{ branchId: null }, { branchId: e.branchId }] } })).map((h) => ymd(h.date)))
  const monthDays = workingDates(from, to, s.weeklyOff, hs).length
  const paidDays = Number(p.workingDays) - lopDays
  const earnings = earningsFor(Number(p.monthlySalary), paidDays, monthDays, s.split)
  const row = await prisma.$transaction(async (tx) => {
    const u = await tx.payslip.update({ where: { id: p.id }, data: { lopDays, paidDays, earnings, extraEarnings: extra ?? Prisma.DbNull, deductions: deductions ?? Prisma.DbNull, notes: d.notes === undefined ? p.notes : d.notes || null, ...totals(earnings, extra, deductions) }, include: { employee: emp } })
    await refreshTotals(tx, p.runId)
    await audit(tx, req, 'UPDATE', HR, 'Payslip', p.id, { lopDays: p.lopDays, netPay: p.netPay }, { lopDays, netPay: u.netPay })
    return u
  })
  res.json(row)
})

payrollRouter.post('/:id/finalise', authorize(HR, 'APPROVE'), async (req, res) => {
  const run = await findRun(req)
  if (run.status !== 'DRAFT') throw conflict('This payroll is already finalised')
  const slips = await prisma.payslip.findMany({ where: { runId: run.id }, include: { employee: { select: { userId: true } } } })
  if (!slips.length) throw bad('There are no payslips in this run. Add salaries to employees first.')
  await prisma.$transaction(async (tx) => {
    await tx.payrollRun.update({ where: { id: run.id }, data: { status: 'FINALISED', finalisedAt: new Date() } })
    for (const s of slips) if (s.employee.userId) await notify(tx, run.organizationId, s.employee.userId, 'payslip.ready', `Your payslip for ${monthName(run.month)} is ready`, '/profile')
    await audit(tx, req, 'APPROVE', HR, 'PayrollRun', run.id, { status: run.status }, { status: 'FINALISED' })
  })
  res.json(await runView(run.organizationId, run.id))
})

payrollRouter.post('/:id/reopen', authorize(HR, 'APPROVE'), async (req, res) => {
  const run = await findRun(req)
  if (run.status !== 'FINALISED') throw conflict(run.status === 'PAID' ? 'This payroll is marked paid and cannot be reopened' : 'This payroll is still a draft')
  await prisma.$transaction(async (tx) => {
    await tx.payrollRun.update({ where: { id: run.id }, data: { status: 'DRAFT', finalisedAt: null } })
    await audit(tx, req, 'UPDATE', HR, 'PayrollRun', run.id, { status: run.status }, { status: 'DRAFT' })
  })
  res.json(await runView(run.organizationId, run.id))
})

payrollRouter.post('/:id/paid', authorize(HR, 'APPROVE'), async (req, res) => {
  const run = await findRun(req)
  if (run.status !== 'FINALISED') throw conflict(run.status === 'PAID' ? 'This payroll is already marked paid' : 'Finalise the payroll first')
  const d = parse(shape({ paidOn: 'd?' }), req.body ?? {})
  await prisma.$transaction(async (tx) => {
    await tx.payrollRun.update({ where: { id: run.id }, data: { status: 'PAID', paidOn: d.paidOn ?? dateOnly(todayStr()) } })
    await audit(tx, req, 'UPDATE', HR, 'PayrollRun', run.id, { status: run.status }, { status: 'PAID' })
  })
  res.json(await runView(run.organizationId, run.id))
})

payrollRouter.delete('/:id', authorize(HR, 'DELETE'), async (req, res) => {
  const run = await findRun(req)
  if (run.status !== 'DRAFT') throw conflict('Only a draft payroll can be deleted')
  await prisma.$transaction(async (tx) => {
    await tx.payrollRun.delete({ where: { id: run.id } })
    await audit(tx, req, 'DELETE', HR, 'PayrollRun', run.id, { month: run.month }, null)
  })
  res.status(204).end()
})

payrollRouter.get('/payslips/:id', authorize(HR, 'VIEW'), async (req, res) => {
  res.json(await payslipView(req.user.organizationId, String(req.params.id)))
})

/** Each person's own payslips, once HR has finalised them. */
export const myPayslipsRouter = Router()
const myEmployeeId = (req: Request) => {
  if (!req.user.employeeId) throw conflict('No employee profile is linked to your login. Ask HR to add one.')
  return req.user.employeeId
}
myPayslipsRouter.get('/', async (req, res) => {
  if (!req.user.employeeId) return res.json({ items: [] })
  const items = await prisma.payslip.findMany({ where: { employeeId: req.user.employeeId, run: { status: { not: 'DRAFT' } } }, select: { id: true, month: true, gross: true, totalDeductions: true, netPay: true, run: { select: { status: true, paidOn: true } } }, orderBy: { month: 'desc' }, take: 24 })
  res.json({ items: items.map((p) => ({ ...p, monthName: monthName(p.month) })) })
})
myPayslipsRouter.get('/:id', async (req, res) => {
  res.json(await payslipView(req.user.organizationId, String(req.params.id), myEmployeeId(req)))
})
