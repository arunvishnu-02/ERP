import { Router } from '../core/router'
import { z } from 'zod'
import { authorize, fullName, type Action } from '../core/auth'
import { crud, findScoped, paging } from '../core/crud'
import { newToken } from '../core/docs'
import { bad, conflict, forbidden, parse, shape } from '../core/http'
import { sendMail, template } from '../core/mail'
import { activity, addDays, audit, computeDoc, inr, nextNumber, notify, render, scoped, taxContext, today, U, usersWith } from '../core/util'
import { prisma, type Tx } from '../db'
import { env } from '../env'
import * as E from '../../generated/prisma/enums'
import { convertLead } from './leads'

const M = 'QUOTATIONS'
export const itemsSchema = z.array(shape({ serviceId: 'id?', milestoneId: 'id?', description: 's', sacCode: 's?', quantity: 'n', unit: 's?', unitPrice: 'n', discountPercent: 'n?', taxRate: 'n?' })).min(1, 'Add at least one line')
const schema = shape({ leadId: 'id?', customerId: 'id?', dealId: 'id?', title: 's?', issueDate: 'd?', validUntil: 'd?', terms: 's?', notes: 's?' }).extend({ items: itemsSchema })
const include = {
  customer: { select: { id: true, name: true, email: true, phone: true, gstin: true, billingState: true, billingAddressLine1: true, billingCity: true, contacts: { where: { isPrimary: true }, take: 1 } } },
  lead: { select: { id: true, firstName: true, lastName: true, companyName: true, email: true, phone: true, whatsappNumber: true, state: true, city: true } },
  preparedBy: U,
}
const one = { ...include, items: { orderBy: { position: 'asc' as const } }, projects: { select: { id: true, name: true, projectNumber: true } } }
const find = (req: any, action: Action) => findScoped(req, 'quotation', M, action as any, { soft: true, include: one, label: 'Quotation' })
const label = (s: string) => s.toLowerCase().replace(/_/g, ' ')

/** Who a quotation is for, with the contact details used when sending it. */
export function party(q: any) {
  const contact = q.customer?.contacts?.[0]
  return q.customer
    ? { name: q.customer.name, contact: contact ? fullName(contact) : q.customer.name, email: contact?.email ?? q.customer.email, phone: contact?.whatsappNumber ?? contact?.phone ?? q.customer.phone }
    : { name: q.lead?.companyName || fullName(q.lead), contact: fullName(q.lead), email: q.lead?.email, phone: q.lead?.whatsappNumber ?? q.lead?.phone }
}

async function build(tx: Tx, organizationId: string, d: any) {
  if (!d.customerId && !d.leadId) throw bad('Choose a lead or a customer')
  const ctx = await taxContext(tx, organizationId, d)
  const { items, totals } = computeDoc(d.items, ctx)
  return { items, cols: { placeOfSupply: ctx.placeOfSupply, isInterState: ctx.interState, ...totals } }
}

export const quotationsRouter = Router()

quotationsRouter.get('/', authorize(M, 'VIEW'), async (req, res) => {
  const where: any = { organizationId: req.user.organizationId, deletedAt: null, isLatest: true, AND: [await scoped(req, M)] }
  if (typeof req.query.status === 'string' && req.query.status) where.status = { in: req.query.status.split(',') }
  for (const f of ['customerId', 'leadId'] as const) if (typeof req.query[f] === 'string' && req.query[f]) where[f] = req.query[f]
  const q = String(req.query.q ?? '').trim()
  if (q) where.AND.push({ OR: [{ quotationNumber: { contains: q } }, { title: { contains: q } }, { customer: { name: { contains: q } } }, { lead: { companyName: { contains: q } } }] })
  const [items, total] = await Promise.all([prisma.quotation.findMany({ where, include, orderBy: { createdAt: 'desc' }, ...paging(req) }), prisma.quotation.count({ where })])
  res.json({ items, total })
})

quotationsRouter.get('/:id', authorize(M, 'VIEW'), async (req, res) => {
  const q = await find(req, 'VIEW')
  const [activities, revisions] = await Promise.all([
    prisma.activity.findMany({ where: { entityType: 'QUOTATION', entityId: { in: (await prisma.quotation.findMany({ where: { organizationId: q.organizationId, quotationNumber: q.quotationNumber }, select: { id: true } })).map((x) => x.id) } }, include: { actor: U }, orderBy: { occurredAt: 'desc' } }),
    prisma.quotation.findMany({ where: { organizationId: q.organizationId, quotationNumber: q.quotationNumber }, select: { id: true, revision: true, status: true, totalAmount: true, createdAt: true }, orderBy: { revision: 'desc' } }),
  ])
  res.json({ ...q, activities, revisions })
})

quotationsRouter.post('/', authorize(M, 'CREATE'), async (req, res) => {
  const d = parse(schema, req.body)
  const organizationId = req.user.organizationId
  const q = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { settings: true } })
    const { items, cols } = await build(tx, organizationId, d)
    const issueDate = d.issueDate ?? today()
    const row = await tx.quotation.create({
      data: {
        organizationId, quotationNumber: await nextNumber(tx, organizationId, 'QUOTATION'), customerId: d.customerId ?? null, leadId: d.leadId ?? null, dealId: d.dealId ?? null,
        title: d.title ?? null, issueDate, validUntil: d.validUntil ?? addDays(issueDate, 15), ...cols, terms: d.terms ?? (org.settings as any)?.quotationTerms ?? null, notes: d.notes ?? null,
        preparedById: req.user.id, createdById: req.user.id, items: { create: items },
      },
      include: one,
    })
    await activity(tx, organizationId, 'QUOTATION', row.id, 'CREATED', 'Drafted', req.user.id)
    if (row.leadId) {
      const lead = await tx.lead.findUniqueOrThrow({ where: { id: row.leadId }, include: { stage: true } })
      const proposal = await tx.leadStage.findFirst({ where: { organizationId, name: { equals: 'Proposal' } } })
      if (proposal && lead.status === 'OPEN' && lead.stage.position < proposal.position) await tx.lead.update({ where: { id: lead.id }, data: { stageId: proposal.id } })
      await activity(tx, organizationId, 'LEAD', lead.id, 'UPDATED', `Quotation ${row.quotationNumber} drafted`, req.user.id)
    }
    await audit(tx, req, 'CREATE', M, 'Quotation', row.id, null, { number: row.quotationNumber, total: row.totalAmount })
    return row
  })
  res.status(201).json(q)
})

quotationsRouter.patch('/:id', authorize(M, 'EDIT'), async (req, res) => {
  const d = parse(schema, req.body)
  const before = await find(req, 'EDIT')
  if (before.status !== 'DRAFT') throw conflict('Only a draft can be edited. Revise it to make changes.')
  const q = await prisma.$transaction(async (tx) => {
    const { items, cols } = await build(tx, before.organizationId, d)
    const row = await tx.quotation.update({
      where: { id: before.id },
      data: { customerId: d.customerId ?? null, leadId: d.leadId ?? null, title: d.title ?? null, issueDate: d.issueDate ?? before.issueDate, validUntil: d.validUntil ?? before.validUntil, terms: d.terms ?? null, notes: d.notes ?? null, ...cols, updatedById: req.user.id, items: { deleteMany: {}, create: items } },
      include: one,
    })
    await audit(tx, req, 'UPDATE', M, 'Quotation', row.id, { total: before.totalAmount }, { total: row.totalAmount })
    return row
  })
  res.json(q)
})

quotationsRouter.delete('/:id', authorize(M, 'DELETE'), async (req, res) => {
  const q = await find(req, 'DELETE')
  if (q.status === 'CONVERTED') throw conflict('This quotation already has a project')
  await prisma.quotation.update({ where: { id: q.id }, data: { deletedAt: new Date() } })
  await audit(prisma as unknown as Tx, req, 'DELETE', M, 'Quotation', q.id, { number: q.quotationNumber }, null)
  res.status(204).end()
})

/** One workflow step: checks the current status, saves the change, and records it on the timeline and audit log. */
async function step(req: any, action: Action, from: string[], data: any, summary: string, after?: (tx: Tx, q: any) => Promise<void>) {
  const q = await find(req, action)
  if (!from.includes(q.status)) throw conflict(`This quotation is ${label(q.status)}, so that step is not available`)
  return prisma.$transaction(async (tx) => {
    const row = await tx.quotation.update({ where: { id: q.id }, data, include: one })
    await activity(tx, q.organizationId, 'QUOTATION', q.id, 'APPROVAL', summary, req.user.id)
    await audit(tx, req, action === 'APPROVE' ? (data.status === 'REJECTED' ? 'REJECT' : 'APPROVE') : 'UPDATE', M, 'Quotation', q.id, { status: q.status }, { status: data.status })
    await after?.(tx, row)
    return row
  })
}

quotationsRouter.post('/:id/submit', authorize(M, 'EDIT'), async (req, res) => {
  res.json(await step(req, 'EDIT', ['DRAFT'], { status: 'PENDING_APPROVAL' }, 'Submitted for approval', async (tx, q) => {
    for (const uid of await usersWith(tx, q.organizationId, M, 'APPROVE')) if (uid !== req.user.id) await notify(tx, q.organizationId, uid, 'quotation.submitted', `Quotation ${q.quotationNumber} is waiting for your approval`, '/quotations')
  }))
})
quotationsRouter.post('/:id/approve', authorize(M, 'APPROVE'), async (req, res) => {
  res.json(await step(req, 'APPROVE', ['PENDING_APPROVAL'], { status: 'APPROVED', rejectionNote: null }, 'Approved', async (tx, q) => {
    if (q.preparedById !== req.user.id) await notify(tx, q.organizationId, q.preparedById, 'quotation.approved', `Quotation ${q.quotationNumber} was approved`, '/quotations')
  }))
})
quotationsRouter.post('/:id/reject', authorize(M, 'APPROVE'), async (req, res) => {
  const d = parse(shape({ note: 's' }), req.body)
  res.json(await step(req, 'APPROVE', ['PENDING_APPROVAL'], { status: 'REJECTED', rejectionNote: d.note }, `Rejected: ${d.note}`, async (tx, q) => {
    if (q.preparedById !== req.user.id) await notify(tx, q.organizationId, q.preparedById, 'quotation.rejected', `Quotation ${q.quotationNumber} was rejected`, '/quotations')
  }))
})
quotationsRouter.post('/:id/accept', authorize(M, 'EDIT'), async (req, res) => {
  res.json(await step(req, 'EDIT', ['SENT', 'VIEWED'], { status: 'ACCEPTED', acceptedAt: new Date() }, 'Marked as accepted by the customer'))
})
quotationsRouter.post('/:id/decline', authorize(M, 'EDIT'), async (req, res) => {
  res.json(await step(req, 'EDIT', ['SENT', 'VIEWED'], { status: 'DECLINED' }, 'Marked as declined by the customer'))
})

quotationsRouter.post('/:id/revise', authorize(M, 'EDIT'), async (req, res) => {
  const q = await find(req, 'EDIT')
  if (!['REJECTED', 'APPROVED', 'SENT', 'VIEWED', 'DECLINED', 'EXPIRED'].includes(q.status)) throw conflict(`This quotation is ${label(q.status)}, so it cannot be revised`)
  const row = await prisma.$transaction(async (tx) => {
    await tx.quotation.update({ where: { id: q.id }, data: { isLatest: false } })
    const issueDate = today()
    const r = await tx.quotation.create({
      data: {
        organizationId: q.organizationId, quotationNumber: q.quotationNumber, revision: q.revision + 1, parentQuotationId: q.id, customerId: q.customerId, leadId: q.leadId, dealId: q.dealId, title: q.title,
        issueDate, validUntil: addDays(issueDate, 15), placeOfSupply: q.placeOfSupply, isInterState: q.isInterState, subtotal: q.subtotal, discountTotal: q.discountTotal, taxableAmount: q.taxableAmount,
        cgstAmount: q.cgstAmount, sgstAmount: q.sgstAmount, igstAmount: q.igstAmount, totalAmount: q.totalAmount, terms: q.terms, notes: q.notes, preparedById: q.preparedById, createdById: req.user.id,
        items: { create: q.items.map(({ id, quotationId, ...it }: any) => it) },
      },
      include: one,
    })
    await activity(tx, q.organizationId, 'QUOTATION', r.id, 'CREATED', `Revision ${r.revision} created from revision ${q.revision}`, req.user.id)
    await audit(tx, req, 'CREATE', M, 'Quotation', r.id, null, { revisionOf: q.id })
    return r
  })
  res.status(201).json(row)
})

quotationsRouter.post('/:id/send', authorize(M, 'EDIT'), async (req, res) => {
  const d = parse(shape({ 'channel?': ['EMAIL', 'WHATSAPP', 'LINK'], to: 's?' }), req.body)
  const before = await find(req, 'EDIT')
  const q = await step(req, 'EDIT', ['APPROVED', 'SENT', 'VIEWED'], { status: before.status === 'APPROVED' ? 'SENT' : before.status, sentAt: new Date(), publicToken: before.publicToken ?? newToken() }, `Sent to the customer${d.channel ? ` (${label(d.channel)})` : ''}`)
  const p = party(q)
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: q.organizationId } })
  const link = `${env.appUrl}/q/${q.publicToken}`
  const vars = { contact: p.contact, number: q.quotationNumber, amount: inr(Number(q.totalAmount)), link, company: org.name, sender: req.user.name }
  let email: any = null
  if (d.channel === 'EMAIL') {
    const to = d.to ?? p.email
    if (!to) throw bad('There is no email address for this customer')
    const t = await template(q.organizationId, 'EMAIL', 'quotation_sent')
    email = await sendMail(q.organizationId, { to, subject: render(t?.subject ?? 'Quotation {{number}}', vars), text: render(t?.body ?? '{{link}}', vars), sentById: req.user.id, leadId: q.leadId, customerId: q.customerId, entityType: 'QUOTATION', entityId: q.id })
  }
  const wa = await template(q.organizationId, 'WHATSAPP', 'quotation_share')
  const message = render(wa?.body ?? 'Quotation {{number}}: {{link}}', vars)
  if (d.channel === 'WHATSAPP') {
    await prisma.message.create({ data: { organizationId: q.organizationId, channel: 'WHATSAPP', direction: 'OUTBOUND', fromAddress: req.user.name, toAddress: p.phone ?? p.contact, body: message, status: 'SENT', sentAt: new Date(), sentById: req.user.id, leadId: q.leadId, customerId: q.customerId, entityType: 'QUOTATION', entityId: q.id } })
  }
  res.json({ ...q, link, email, message, phone: p.phone ?? null })
})

quotationsRouter.post('/:id/convert', authorize(M, 'EDIT'), async (req, res) => {
  const d = parse(shape({ name: 's?', managerId: 'id?', 'category?': Object.values(E.ServiceCategory), dueDate: 'd?', 'memberIds?': 's[]' }), req.body)
  const q = await findScoped(req, 'quotation', M, 'EDIT', { soft: true, label: 'Quotation', include: { items: { orderBy: { position: 'asc' } }, lead: true, customer: true } })
  if (q.status !== 'ACCEPTED') throw conflict('Mark the quotation as accepted before creating the project')
  const organizationId = q.organizationId
  const project = await prisma.$transaction(async (tx) => {
    const customer = q.customer ?? (await convertLead(tx, q.lead, req.user.id))
    if (q.lead && q.lead.status === 'OPEN' && q.customer) await tx.lead.update({ where: { id: q.lead.id }, data: { status: 'CONVERTED', convertedAt: new Date(), customerId: customer.id, nextFollowUpAt: null } })
    const managerId = d.managerId ?? req.user.id
    const p = await tx.project.create({
      data: {
        organizationId, projectNumber: await nextNumber(tx, organizationId, 'PROJECT'), name: d.name || q.title || `${q.items[0].description} for ${customer.name}`.slice(0, 200), customerId: customer.id,
        quotationId: q.id, dealId: q.dealId, category: d.category ?? 'OTHER', startDate: today(), dueDate: d.dueDate ?? null, budget: q.taxableAmount, managerId, createdById: req.user.id,
        members: { create: [...new Set((d.memberIds ?? []) as string[])].filter((id) => id !== managerId).map((userId) => ({ userId })) },
        milestones: { create: q.items.map((it: any, position: number) => ({ name: it.description.slice(0, 200), position, isBillable: true, amount: it.taxableAmount })) },
      },
    })
    await tx.quotation.update({ where: { id: q.id }, data: { status: 'CONVERTED', customerId: customer.id } })
    if (q.dealId) {
      const deal = await tx.deal.findUnique({ where: { id: q.dealId } })
      const won = deal && (await tx.pipelineStage.findFirst({ where: { pipelineId: deal.pipelineId, isWon: true } }))
      if (deal && won) await tx.deal.update({ where: { id: deal.id }, data: { stageId: won.id, status: 'WON', closedAt: new Date(), customerId: customer.id } })
    }
    await activity(tx, organizationId, 'QUOTATION', q.id, 'UPDATED', `Project ${p.projectNumber} created`, req.user.id)
    await activity(tx, organizationId, 'PROJECT', p.id, 'CREATED', `Project created from quotation ${q.quotationNumber}`, req.user.id)
    if (managerId !== req.user.id) await notify(tx, organizationId, managerId, 'project.assigned', `New project assigned to you: ${p.name}`, '/projects')
    await audit(tx, req, 'CREATE', 'PROJECTS', 'Project', p.id, null, { fromQuotation: q.id })
    return p
  })
  res.status(201).json(project)
})

// ── Service catalogue and packages ──
export const servicesRouter = crud({
  model: 'service', module: M, label: 'Service', orderBy: { name: 'asc' }, search: ['name', 'code'], filters: ['category', 'isActive'],
  fields: { name: 's', code: 's?', category: Object.values(E.ServiceCategory), description: 's?', sacCode: 's?', 'unit?': 's', basePrice: 'n', 'gstRate?': 'n', 'billingCycle?': Object.values(E.BillingCycle), 'isActive?': 'b' },
})
export const packagesRouter = Router()
const pkgSchema = shape({ name: 's', description: 's?', price: 'n', 'billingCycle?': Object.values(E.BillingCycle), 'isActive?': 'b' }).extend({ items: z.array(shape({ serviceId: 'id', quantity: 'n', unitPrice: 'n?' })).min(1, 'Add at least one service') })
packagesRouter.post('/', authorize(M, 'CREATE'), async (req, res) => {
  const { items, ...d } = parse(pkgSchema, req.body)
  res.status(201).json(await prisma.servicePackage.create({ data: { ...d, organizationId: req.user.organizationId, items: { create: items } }, include: { items: true } }))
})
packagesRouter.patch('/:id', authorize(M, 'EDIT'), async (req, res) => {
  const { items, ...d } = parse(pkgSchema, req.body)
  const p = await prisma.servicePackage.findFirst({ where: { id: String(req.params.id), organizationId: req.user.organizationId } })
  if (!p) throw forbidden()
  res.json(await prisma.servicePackage.update({ where: { id: p.id }, data: { ...d, items: { deleteMany: {}, create: items } }, include: { items: true } }))
})
packagesRouter.delete('/:id', authorize(M, 'DELETE'), async (req, res) => {
  await prisma.servicePackage.deleteMany({ where: { id: String(req.params.id), organizationId: req.user.organizationId } })
  res.status(204).end()
})
