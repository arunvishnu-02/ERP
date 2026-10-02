import { Router } from 'express'
import { z } from 'zod'
import { authorize, fullName } from '../core/auth.js'
import { findScoped, paging } from '../core/crud.js'
import { createInvoice, issueInvoice, recalcInvoice, runRecurring } from '../core/docs.js'
import { bad, conflict, forbidden, notFound, parse, shape } from '../core/http.js'
import { sendMail, template } from '../core/mail.js'
import { remindInvoice } from '../core/reminders.js'
import { activity, audit, computeDoc, inr, nextNumber, render, scoped, taxContext, today, ymd } from '../core/util.js'
import { prisma, type Tx } from '../db.js'
import { env } from '../env.js'
import { itemsSchema } from './quotations.js'

const M = 'INVOICES'
const schema = shape({ customerId: 'id', projectId: 'id?', quotationId: 'id?', issueDate: 'd?', dueDate: 'd?', notes: 's?', terms: 's?' }).extend({ items: itemsSchema })
const listInclude = { customer: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } }
const one = {
  customer: { include: { contacts: { where: { isPrimary: true }, take: 1 } } },
  project: { select: { id: true, name: true, projectNumber: true } },
  items: { orderBy: { position: 'asc' as const }, include: { milestone: { select: { id: true, name: true } } } },
  paymentAllocations: { include: { payment: true } },
  creditNotes: true,
}
const find = (req: any, action: 'VIEW' | 'EDIT' | 'DELETE', id?: string) => findScoped(req, 'invoice', M, action, { soft: true, include: one, label: 'Invoice', id })
const OPEN = ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE']
const mark = (i: any) => ({ ...i, overdue: OPEN.includes(i.status) && i.dueDate < today() })

export const invoicesRouter = Router()

invoicesRouter.get('/', authorize(M, 'VIEW'), async (req, res) => {
  const where: any = { organizationId: req.user.organizationId, deletedAt: null, AND: [await scoped(req, M)] }
  const s = req.query.status
  if (s === 'UNPAID') where.status = { in: OPEN }
  else if (s === 'OVERDUE') { where.status = { in: OPEN }; where.dueDate = { lt: today() } }
  else if (typeof s === 'string' && s) where.status = { in: s.split(',') }
  for (const f of ['customerId', 'projectId'] as const) if (typeof req.query[f] === 'string' && req.query[f]) where[f] = req.query[f]
  const q = String(req.query.q ?? '').trim()
  if (q) where.AND.push({ OR: [{ invoiceNumber: { contains: q, mode: 'insensitive' } }, { customer: { name: { contains: q, mode: 'insensitive' } } }] })
  const all = req.query.all === '1'
  if (all && !req.user.perms[M]?.EXPORT) throw forbidden('You do not have permission to export this list')
  const [items, total] = await Promise.all([prisma.invoice.findMany({ where, include: listInclude, orderBy: { createdAt: 'desc' }, ...(all ? { take: 5000, skip: 0 } : paging(req)) }), prisma.invoice.count({ where })])
  res.json({ items: items.map(mark), total })
})

invoicesRouter.get('/:id', authorize(M, 'VIEW'), async (req, res) => {
  res.json(mark(await find(req, 'VIEW')))
})

invoicesRouter.post('/', authorize(M, 'CREATE'), async (req, res) => {
  const d = parse(schema, req.body)
  const inv = await prisma.$transaction(async (tx) => {
    const row = await createInvoice(tx, req.user.organizationId, req.user.id, d)
    await activity(tx, row.organizationId, 'INVOICE', row.id, 'CREATED', 'Draft created', req.user.id)
    await audit(tx, req, 'CREATE', M, 'Invoice', row.id, null, { customerId: d.customerId, total: row.totalAmount })
    return row
  })
  res.status(201).json(inv)
})

invoicesRouter.patch('/:id', authorize(M, 'EDIT'), async (req, res) => {
  const d = parse(schema, req.body)
  const before = await find(req, 'EDIT')
  if (before.status !== 'DRAFT') throw conflict('Only a draft invoice can be edited. Use a credit note to correct a sent invoice.')
  const inv = await prisma.$transaction(async (tx) => {
    const ctx = await taxContext(tx, before.organizationId, { customerId: d.customerId })
    const { items, totals } = computeDoc(d.items, ctx)
    const row = await tx.invoice.update({
      where: { id: before.id },
      data: {
        customerId: d.customerId, projectId: d.projectId ?? null, issueDate: d.issueDate ?? before.issueDate, dueDate: d.dueDate ?? before.dueDate, notes: d.notes ?? null, terms: d.terms ?? null,
        placeOfSupply: ctx.placeOfSupply, isInterState: ctx.interState, ...totals, balanceDue: totals.totalAmount, updatedById: req.user.id,
        items: { deleteMany: {}, create: items.map((it, i) => ({ ...it, milestoneId: d.items[i].milestoneId ?? null })) },
      },
      include: one,
    })
    await audit(tx, req, 'UPDATE', M, 'Invoice', row.id, { total: before.totalAmount }, { total: row.totalAmount })
    return row
  })
  res.json(inv)
})

invoicesRouter.delete('/:id', authorize(M, 'DELETE'), async (req, res) => {
  const inv = await find(req, 'DELETE')
  if (inv.status !== 'DRAFT') throw conflict('A sent invoice cannot be deleted. Void it instead.')
  await prisma.invoice.delete({ where: { id: inv.id } })
  await audit(prisma as unknown as Tx, req, 'DELETE', M, 'Invoice', inv.id, { number: inv.invoiceNumber }, null)
  res.status(204).end()
})

invoicesRouter.post('/:id/send', authorize(M, 'EDIT'), async (req, res) => {
  const d = parse(shape({ 'channel?': ['EMAIL', 'WHATSAPP', 'LINK'], to: 's?' }), req.body)
  const inv = await find(req, 'EDIT')
  if (['VOID', 'CANCELLED'].includes(inv.status)) throw conflict('This invoice has been voided')
  const sent = await prisma.$transaction(async (tx) => {
    const row = await issueInvoice(tx, inv)
    await activity(tx, inv.organizationId, 'INVOICE', inv.id, 'UPDATED', inv.status === 'DRAFT' ? `Issued as ${row.invoiceNumber}` : 'Sent again', req.user.id)
    await audit(tx, req, 'UPDATE', M, 'Invoice', inv.id, { status: inv.status }, { status: row.status, number: row.invoiceNumber })
    return row
  })
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: inv.organizationId } })
  const contact = inv.customer.contacts[0]
  const link = `${env.appUrl}/i/${sent.publicToken}`
  const vars = { contact: contact ? fullName(contact) : inv.customer.name, number: sent.invoiceNumber, amount: inr(Number(sent.totalAmount)), due_date: ymd(sent.dueDate), link, company: org.name, sender: req.user.name }
  const phone = contact?.whatsappNumber ?? contact?.phone ?? inv.customer.phone ?? null
  let email: any = null
  if (d.channel === 'EMAIL') {
    const to = d.to ?? contact?.email ?? inv.customer.email
    if (!to) throw bad('There is no email address for this customer')
    const t = await template(inv.organizationId, 'EMAIL', 'invoice_sent')
    email = await sendMail(inv.organizationId, { to, subject: render(t?.subject ?? 'Invoice {{number}}', vars), text: render(t?.body ?? '{{link}}', vars), sentById: req.user.id, customerId: inv.customerId, entityType: 'INVOICE', entityId: inv.id })
  }
  const message = render((await template(inv.organizationId, 'WHATSAPP', 'invoice_share'))?.body ?? 'Invoice {{number}}: {{link}}', vars)
  if (d.channel === 'WHATSAPP') {
    await prisma.message.create({ data: { organizationId: inv.organizationId, channel: 'WHATSAPP', direction: 'OUTBOUND', fromAddress: req.user.name, toAddress: phone ?? vars.contact, body: message, status: 'SENT', sentAt: new Date(), sentById: req.user.id, customerId: inv.customerId, entityType: 'INVOICE', entityId: inv.id } })
  }
  res.json({ ...sent, link, email, message, phone })
})

invoicesRouter.post('/:id/void', authorize(M, 'DELETE'), async (req, res) => {
  const inv = await find(req, 'DELETE')
  if (Number(inv.amountPaid) + Number(inv.tdsAmount) > 0) throw conflict('This invoice has payments. Delete the payments first.')
  if (inv.status === 'DRAFT') throw conflict('Delete the draft instead')
  const row = await prisma.$transaction(async (tx) => {
    const u = await tx.invoice.update({ where: { id: inv.id }, data: { status: 'VOID', balanceDue: 0 } })
    await activity(tx, inv.organizationId, 'INVOICE', inv.id, 'STATUS_CHANGED', 'Voided', req.user.id)
    await audit(tx, req, 'UPDATE', M, 'Invoice', inv.id, { status: inv.status }, { status: 'VOID' })
    return u
  })
  res.json(row)
})

invoicesRouter.post('/:id/remind', authorize(M, 'EDIT'), async (req, res) => {
  const inv = await find(req, 'EDIT')
  if (!OPEN.includes(inv.status)) throw conflict('Reminders are for sent invoices with a balance')
  const n = await prisma.paymentReminder.count({ where: { invoiceId: inv.id } })
  res.json(await remindInvoice(inv.id, n + 1, req.user.id))
})

// ── Credit notes ──
export const creditNotesRouter = Router()
creditNotesRouter.get('/', authorize(M, 'VIEW'), async (req, res) => {
  const where = { organizationId: req.user.organizationId, AND: [await scoped(req, M)] }
  const items = await prisma.creditNote.findMany({ where, include: { customer: { select: { id: true, name: true } }, invoice: { select: { id: true, invoiceNumber: true } } }, orderBy: { createdAt: 'desc' }, ...paging(req) })
  res.json({ items, total: await prisma.creditNote.count({ where }) })
})
creditNotesRouter.post('/', authorize(M, 'CREATE'), async (req, res) => {
  const d = parse(shape({ invoiceId: 'id', reason: 's', amount: 'n' }), req.body)
  const inv = await find(req, 'EDIT', d.invoiceId)
  if (!OPEN.includes(inv.status)) throw conflict('A credit note needs a sent invoice with a balance')
  if (d.amount <= 0) throw bad('Enter the amount to credit, before GST')
  const r2 = (n: number) => Math.round(n * 100) / 100
  const base = Number(inv.taxableAmount) || 1
  const [cgst, sgst, igst] = [inv.cgstAmount, inv.sgstAmount, inv.igstAmount].map((x: any) => r2((d.amount * Number(x)) / base))
  const total = r2(d.amount + cgst + sgst + igst)
  if (total > Number(inv.balanceDue) + 0.01) throw bad(`That is more than the balance of ${inr(Number(inv.balanceDue))}`)
  const cn = await prisma.$transaction(async (tx) => {
    const row = await tx.creditNote.create({
      data: {
        organizationId: inv.organizationId, creditNoteNumber: await nextNumber(tx, inv.organizationId, 'CREDIT_NOTE'), invoiceId: inv.id, customerId: inv.customerId, issueDate: today(), reason: d.reason,
        status: 'ISSUED', taxableAmount: d.amount, cgstAmount: cgst, sgstAmount: sgst, igstAmount: igst, totalAmount: total, createdById: req.user.id,
        items: { create: [{ description: d.reason, quantity: 1, unitPrice: d.amount, taxRate: r2(((cgst + sgst + igst) / d.amount) * 100), taxableAmount: d.amount, lineTotal: total }] },
      },
    })
    await tx.invoice.update({ where: { id: inv.id }, data: { creditedAmount: { increment: total } } })
    await recalcInvoice(tx, inv.id)
    await activity(tx, inv.organizationId, 'INVOICE', inv.id, 'UPDATED', `Credit note ${row.creditNoteNumber} for ${inr(total)}: ${d.reason}`, req.user.id)
    await audit(tx, req, 'CREATE', M, 'CreditNote', row.id, null, { invoiceId: inv.id, total })
    return row
  })
  res.status(201).json(cn)
})

// ── Recurring invoices ──
export const recurringRouter = Router()
const recSchema = shape({ customerId: 'id', projectId: 'id?', title: 's', frequency: ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'], startDate: 'd', endDate: 'd?', 'status?': ['ACTIVE', 'PAUSED'] })
  .extend({ items: z.array(shape({ serviceId: 'id?', description: 's', sacCode: 's?', quantity: 'n', unitPrice: 'n', taxRate: 'n?' })).min(1, 'Add at least one line') })
const recInclude = { customer: { select: { id: true, name: true } }, items: true }
const recFind = async (req: any) => {
  const r = await prisma.recurringInvoice.findFirst({ where: { id: String(req.params.id), organizationId: req.user.organizationId, AND: [await scoped(req, M)] }, include: recInclude })
  if (!r) throw notFound('Recurring invoice')
  return r
}
recurringRouter.get('/', authorize(M, 'VIEW'), async (req, res) => {
  const items = await prisma.recurringInvoice.findMany({ where: { organizationId: req.user.organizationId, AND: [await scoped(req, M)] }, include: recInclude, orderBy: { nextRunDate: 'asc' } })
  res.json({ items, total: items.length })
})
recurringRouter.post('/', authorize(M, 'CREATE'), async (req, res) => {
  const { items, ...d } = parse(recSchema, req.body)
  const r = await prisma.recurringInvoice.create({
    data: { ...d, organizationId: req.user.organizationId, nextRunDate: d.startDate, createdById: req.user.id, items: { create: items.map((i: any) => ({ ...i, taxRate: i.taxRate ?? 18 })) } },
    include: recInclude,
  })
  await audit(prisma as unknown as Tx, req, 'CREATE', M, 'RecurringInvoice', r.id, null, d)
  res.status(201).json(r)
})
recurringRouter.patch('/:id', authorize(M, 'EDIT'), async (req, res) => {
  const d = parse(shape({ title: 's', 'status?': ['ACTIVE', 'PAUSED', 'ENDED'], nextRunDate: 'd', endDate: 'd?' }).partial(), req.body)
  const r = await recFind(req)
  res.json(await prisma.recurringInvoice.update({ where: { id: r.id }, data: d, include: recInclude }))
})
recurringRouter.delete('/:id', authorize(M, 'DELETE'), async (req, res) => {
  const r = await recFind(req)
  await prisma.$transaction([prisma.invoice.updateMany({ where: { recurringInvoiceId: r.id }, data: { recurringInvoiceId: null } }), prisma.recurringInvoice.delete({ where: { id: r.id } })])
  res.status(204).end()
})
recurringRouter.post('/:id/run', authorize(M, 'CREATE'), async (req, res) => {
  const r = await recFind(req)
  if (r.status === 'ENDED') throw conflict('This schedule has ended')
  const inv = await prisma.$transaction(async (tx) => {
    const row = await runRecurring(tx, r.id, req.user.id)
    await activity(tx, r.organizationId, 'INVOICE', row.id, 'CREATED', `Draft created from recurring schedule "${r.title}"`, req.user.id)
    return row
  })
  res.status(201).json(inv)
})
