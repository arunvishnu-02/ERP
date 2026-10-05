// Hiring: job openings, the people who apply, the offer letter, and turning a candidate into an employee.
import { Router } from '../core/router'
import { authorize } from '../core/auth'
import { crud } from '../core/crud'
import { conflict, isUuid, notFound, parse, shape } from '../core/http'
import { addDays, audit, nextNumber, todayStr } from '../core/util'
import { prisma } from '../db'
import * as E from '../../generated/prisma/enums'
import { payrollSettings } from './payroll'

const HR = 'HR'
export const hiringRouter = Router()

const findCandidate = async (req: any) => {
  const c = isUuid(req.params.id) ? await prisma.candidate.findFirst({ where: { id: String(req.params.id), organizationId: req.user.organizationId }, include: { job: true } }) : null
  if (!c) throw notFound('Candidate')
  return c
}

/** The data the offer letter prints, in the same shape as an employee's letter. */
hiringRouter.get('/candidates/:id/offer', authorize(HR, 'VIEW'), async (req, res) => {
  const c = await findCandidate(req)
  const [org, dept] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: req.user.organizationId } }),
    c.job.departmentId ? prisma.department.findUnique({ where: { id: c.job.departmentId }, select: { name: true } }) : null,
  ])
  const monthly = Number(c.monthlySalary ?? 0)
  res.json({
    employee: { employeeCode: `CAND-${c.id.slice(0, 6).toUpperCase()}`, firstName: c.firstName, lastName: c.lastName, designation: c.job.title, employmentType: c.job.employmentType, department: dept, personalEmail: c.email, phone: c.phone, dateOfJoining: c.joiningDate },
    settings: payrollSettings(org.settings), monthly, annual: monthly * 12,
  })
})

hiringRouter.post('/candidates/:id/offer-sent', authorize(HR, 'EDIT'), async (req, res) => {
  const d = parse(shape({ monthlySalary: 'n', joiningDate: 'd' }), req.body)
  const c = await findCandidate(req)
  if (['JOINED', 'REJECTED'].includes(c.stage)) throw conflict('This candidate is no longer in the hiring steps')
  res.json(await prisma.candidate.update({ where: { id: c.id }, data: { stage: 'OFFER', offerSentAt: new Date(), monthlySalary: d.monthlySalary, joiningDate: d.joiningDate } }))
})

/** Creates the employee record from what the candidate gave us, and marks them as joined. */
hiringRouter.post('/candidates/:id/hire', authorize(HR, 'CREATE'), async (req, res) => {
  const c = await findCandidate(req)
  if (c.employeeId) throw conflict('This person is already an employee')
  if (c.stage === 'REJECTED') throw conflict('This candidate was not selected')
  const employee = await prisma.$transaction(async (tx) => {
    const e = await tx.employee.create({
      data: {
        organizationId: c.organizationId, employeeCode: await nextNumber(tx, c.organizationId, 'EMPLOYEE'), firstName: c.firstName, lastName: c.lastName, designation: c.job.title,
        employmentType: c.job.employmentType, departmentId: c.job.departmentId, dateOfJoining: c.joiningDate ?? new Date(`${todayStr()}T00:00:00.000Z`),
        personalEmail: c.email, phone: c.phone, ctcAnnual: c.monthlySalary ? Number(c.monthlySalary) * 12 : null,
      },
    })
    await tx.candidate.update({ where: { id: c.id }, data: { stage: 'JOINED', offerAccepted: true, employeeId: e.id } })
    await audit(tx, req, 'CREATE', HR, 'Employee', e.id, null, { fromCandidate: c.id })
    return e
  })
  res.status(201).json(employee)
})

hiringRouter.use('/openings', crud({
  model: 'jobOpening', module: HR, label: 'Job opening', orderBy: [{ status: 'asc' }, { openedOn: 'desc' }], filters: ['status'], search: ['title'],
  fields: { title: 's', departmentId: 'id?', 'employmentType?': Object.values(E.EmploymentType), location: 's?', salaryRange: 's?', description: 's?', 'status?': Object.values(E.OpeningStatus), openedOn: 'd?' },
  beforeCreate: (d, req) => { d.createdById = req.user.id; d.openedOn ??= new Date(`${todayStr()}T00:00:00.000Z`) },
  decorate: async (items) => {
    if (!items.length) return items
    const since = addDays(new Date(), -30)
    const [counts, recent] = await Promise.all([
      prisma.candidate.groupBy({ by: ['jobId'], where: { jobId: { in: items.map((i) => i.id) } }, _count: { _all: true } }),
      prisma.candidate.groupBy({ by: ['jobId'], where: { jobId: { in: items.map((i) => i.id) }, createdAt: { gte: since } }, _count: { _all: true } }),
    ])
    return items.map((i) => ({ ...i, applied: counts.find((c) => c.jobId === i.id)?._count._all ?? 0, appliedThisMonth: recent.find((c) => c.jobId === i.id)?._count._all ?? 0 }))
  },
}))

hiringRouter.use('/candidates', crud({
  model: 'candidate', module: HR, label: 'Candidate', orderBy: { createdAt: 'desc' }, filters: ['jobId', 'stage'], search: ['firstName', 'lastName', 'email', 'phone'],
  fields: {
    jobId: 'id', firstName: 's', lastName: 's?', email: 's?', phone: 's?', source: 's?', experience: 's?', link: 's?', 'stage?': Object.values(E.CandidateStage),
    interviewAt: 'd?', monthlySalary: 'n?', joiningDate: 'd?', notes: 's?', rejectionReason: 's?',
  },
  include: { job: { select: { id: true, title: true } } },
  beforeCreate: async (d, req) => {
    d.createdById = req.user.id
    if (!(await prisma.jobOpening.findFirst({ where: { id: d.jobId, organizationId: req.user.organizationId } }))) throw notFound('Job opening')
  },
}))
