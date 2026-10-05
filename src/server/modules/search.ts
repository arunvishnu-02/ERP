// "Search everywhere": one box that finds leads, customers, quotations, invoices, projects, tickets and tasks,
// each limited to what the person may see in that module.
import { Router } from '../core/router'
import { scoped } from '../core/util'
import { prisma } from '../db'

export const searchRouter = Router()
const TAKE = 5
const customer = { select: { name: true } }

searchRouter.get('/', async (req, res) => {
  const q = String(req.query.q ?? '').trim().slice(0, 100)
  if (q.length < 2) return res.json({ groups: [] })
  const organizationId = req.user.organizationId
  const has = { contains: q }
  // returns null when the person has no view permission, so that module is skipped
  const where = async (module: string, extra: any) => {
    const w = await scoped(req, module, 'VIEW')
    return w ? { organizationId, AND: [w, extra] } : null
  }
  const run = async <T>(w: any, fn: (w: any) => Promise<T[]>) => (w ? fn(w) : [])

  const [leads, customers, quotations, invoices, projects, tickets, tasks] = await Promise.all([
    where('LEADS', { deletedAt: null, OR: [{ firstName: has }, { lastName: has }, { companyName: has }, { phone: has }, { email: has }, { leadNumber: has }] })
      .then((w) => run(w, (w) => prisma.lead.findMany({ where: w, select: { id: true, firstName: true, lastName: true, companyName: true, phone: true, status: true }, take: TAKE, orderBy: { updatedAt: 'desc' } }))),
    where('CUSTOMERS', { deletedAt: null, OR: [{ name: has }, { customerNumber: has }, { phone: has }, { email: has }, { gstin: has }] })
      .then((w) => run(w, (w) => prisma.customer.findMany({ where: w, select: { id: true, name: true, billingCity: true, customerNumber: true, status: true }, take: TAKE, orderBy: { updatedAt: 'desc' } }))),
    where('QUOTATIONS', { deletedAt: null, isLatest: true, OR: [{ quotationNumber: has }, { title: has }, { customer: { name: has } }] })
      .then((w) => run(w, (w) => prisma.quotation.findMany({ where: w, select: { id: true, quotationNumber: true, title: true, status: true, totalAmount: true, customer, lead: { select: { companyName: true, firstName: true } } }, take: TAKE, orderBy: { updatedAt: 'desc' } }))),
    where('INVOICES', { deletedAt: null, OR: [{ invoiceNumber: has }, { customer: { name: has } }] })
      .then((w) => run(w, (w) => prisma.invoice.findMany({ where: w, select: { id: true, invoiceNumber: true, status: true, totalAmount: true, balanceDue: true, customer }, take: TAKE, orderBy: { updatedAt: 'desc' } }))),
    where('PROJECTS', { deletedAt: null, OR: [{ name: has }, { projectNumber: has }, { customer: { name: has } }] })
      .then((w) => run(w, (w) => prisma.project.findMany({ where: w, select: { id: true, name: true, projectNumber: true, status: true, progressPercent: true, customer }, take: TAKE, orderBy: { updatedAt: 'desc' } }))),
    where('TICKETS', { OR: [{ subject: has }, { ticketNumber: has }, { customer: { name: has } }] })
      .then((w) => run(w, (w) => prisma.ticket.findMany({ where: w, select: { id: true, subject: true, ticketNumber: true, status: true, customer }, take: TAKE, orderBy: { updatedAt: 'desc' } }))),
    where('TASKS', { deletedAt: null, OR: [{ title: has }, { taskNumber: has }] })
      .then((w) => run(w, (w) => prisma.task.findMany({ where: w, select: { id: true, title: true, taskNumber: true, status: true, project: { select: { name: true } } }, take: TAKE, orderBy: { updatedAt: 'desc' } }))),
  ])

  const name = (l: { firstName: string; lastName: string | null }) => [l.firstName, l.lastName].filter(Boolean).join(' ')
  const groups = [
    { key: 'customers', title: 'Customers', items: customers.map((c) => ({ id: c.id, kind: 'customer', title: c.name, sub: [c.customerNumber, c.billingCity].filter(Boolean).join(', '), status: c.status, href: `/customers?open=${c.id}` })) },
    { key: 'leads', title: 'Leads', items: leads.map((l) => ({ id: l.id, kind: 'lead', title: l.companyName || name(l), sub: [l.companyName ? name(l) : null, l.phone].filter(Boolean).join(', '), status: l.status, href: `/leads?open=${l.id}` })) },
    {
      key: 'docs', title: 'Invoices and quotations', items: [
        ...invoices.map((i) => ({ id: i.id, kind: 'invoice', title: `Invoice ${i.invoiceNumber}`, sub: i.customer.name, amount: Number(i.balanceDue) > 0 ? Number(i.balanceDue) : Number(i.totalAmount), status: i.status, href: `/invoices?open=${i.id}` })),
        ...quotations.map((x) => ({ id: x.id, kind: 'quotation', title: `Quotation ${x.quotationNumber}`, sub: [x.customer?.name ?? x.lead?.companyName ?? x.lead?.firstName, x.title].filter(Boolean).join(', '), amount: Number(x.totalAmount), status: x.status, href: `/quotations?open=${x.id}` })),
      ],
    },
    {
      key: 'work', title: 'Projects, tickets and tasks', items: [
        ...projects.map((p) => ({ id: p.id, kind: 'project', title: p.name, sub: `${p.customer.name}, ${p.progressPercent}% done`, status: p.status, href: `/projects?open=${p.id}` })),
        ...tickets.map((t) => ({ id: t.id, kind: 'ticket', title: t.subject, sub: `Ticket ${t.ticketNumber} from ${t.customer.name}`, status: t.status, href: `/tickets?open=${t.id}` })),
        ...tasks.map((t) => ({ id: t.id, kind: 'task', title: t.title, sub: [t.taskNumber, t.project?.name].filter(Boolean).join(', '), status: t.status, href: `/tasks?open=${t.id}` })),
      ],
    },
  ].filter((g) => g.items.length)
  res.json({ groups })
})
