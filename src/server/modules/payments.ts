import { Router } from '../core/router'
import { z } from 'zod'
import { authorize } from '../core/auth'
import { crud, paging } from '../core/crud'
import { recalcInvoice } from '../core/docs'
import { bad, forbidden, notFound, parse, shape } from '../core/http'
import { activity, audit, daysBetween, inr, nextNumber, notify, scoped, today } from '../core/util'
import { prisma } from '../db'
import * as E from '../../generated/prisma/enums'

const M = 'PAYMENTS'
const schema = shape({ customerId: 'id', paymentDate: 'd?', method: Object.values(E.PaymentMethod), referenceNumber: 's?', bankAccountId: 'id?', notes: 's?' })
  .extend({ allocations: z.array(shape({ invoiceId: 'id', amount: 'n', tdsAmount: 'n?' })).min(1, 'Choose at least one invoice') })
const include = { customer: { select: { id: true, name: true, gstin: true, billingState: true } }, allocations: { include: { invoice: { select: { id: true, invoiceNumber: true, totalAmount: true } } } }, bankAccount: true }

export const paymentsRouter = Router()

paymentsRouter.get('/pending', authorize(M, 'VIEW'), async (req, res) => {
  const t = today()
  const items = await prisma.invoice.findMany({
    where: { organizationId: req.user.organizationId, deletedAt: null, status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'] }, AND: [await scoped(req, M)] },
    include: { customer: { select: { id: true, name: true, phone: true, email: true, contacts: { where: { isPrimary: true }, take: 1 } } } }, orderBy: { dueDate: 'asc' },
  })
  const buckets = { notDue: 0, upTo15: 0, upTo30: 0, over30: 0 }
  const rows = items.map((i) => {
    const days = daysBetween(t, i.dueDate)
    const b = Number(i.balanceDue)
    if (days <= 0) buckets.notDue += b
    else if (days <= 15) buckets.upTo15 += b
    else if (days <= 30) buckets.upTo30 += b
    else buckets.over30 += b
    return { ...i, daysOverdue: Math.max(0, days) }
  })
  res.json({ items: rows, buckets })
})

paymentsRouter.get('/', authorize(M, 'VIEW'), async (req, res) => {
  const where: any = { organizationId: req.user.organizationId, AND: [await scoped(req, M)] }
  const q = String(req.query.q ?? '').trim()
  if (q) where.AND.push({ OR: [{ receiptNumber: { contains: q, mode: 'insensitive' } }, { referenceNumber: { contains: q, mode: 'insensitive' } }, { customer: { name: { contains: q, mode: 'insensitive' } } }] })
  if (typeof req.query.customerId === 'string' && req.query.customerId) where.customerId = req.query.customerId
  const all = req.query.all === '1'
  if (all && !req.user.perms[M]?.EXPORT) throw forbidden('You do not have permission to export this list')
  const [items, total, sum] = await Promise.all([
    prisma.payment.findMany({ where, include, orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }], ...(all ? { take: 5000, skip: 0 } : paging(req)) }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({ where, _sum: { amount: true, tdsAmount: true } }),
  ])
  res.json({ items, total, sum: { amount: Number(sum._sum.amount ?? 0), tdsAmount: Number(sum._sum.tdsAmount ?? 0) } })
})

paymentsRouter.get('/:id', authorize(M, 'VIEW'), async (req, res) => {
  const p = await prisma.payment.findFirst({ where: { id: String(req.params.id), organizationId: req.user.organizationId, AND: [await scoped(req, M)] }, include })
  if (!p) throw notFound('Payment')
  res.json(p)
})

paymentsRouter.post('/', authorize(M, 'CREATE'), async (req, res) => {
  const d = parse(schema, req.body)
  const organizationId = req.user.organizationId
  const payment = await prisma.$transaction(async (tx) => {
    let amount = 0
    let tds = 0
    for (const a of d.allocations) {
      const inv = await tx.invoice.findFirst({ where: { id: a.invoiceId, organizationId, customerId: d.customerId, deletedAt: null } })
      if (!inv || ['DRAFT', 'VOID', 'CANCELLED'].includes(inv.status)) throw bad('Choose a sent invoice of this customer')
      a.tdsAmount = Number(a.tdsAmount ?? 0)
      if (a.amount < 0 || a.tdsAmount < 0 || a.amount + a.tdsAmount <= 0) throw bad('Enter the amount received')
      if (a.amount + a.tdsAmount > Number(inv.balanceDue) + 0.01) throw bad(`That is more than the balance of ${inr(Number(inv.balanceDue))} on ${inv.invoiceNumber}`)
      amount += a.amount
      tds += a.tdsAmount
    }
    const p = await tx.payment.create({
      data: {
        organizationId, receiptNumber: await nextNumber(tx, organizationId, 'RECEIPT'), customerId: d.customerId, paymentDate: d.paymentDate ?? today(), amount, tdsAmount: tds, method: d.method,
        referenceNumber: d.referenceNumber ?? null, bankAccountId: d.bankAccountId ?? null, notes: d.notes ?? null, createdById: req.user.id,
        allocations: { create: d.allocations.map((a: any) => ({ invoiceId: a.invoiceId, amount: a.amount, tdsAmount: a.tdsAmount })) },
      },
      include,
    })
    for (const a of d.allocations) {
      await tx.invoice.update({ where: { id: a.invoiceId }, data: { amountPaid: { increment: a.amount }, tdsAmount: { increment: a.tdsAmount } } })
      await recalcInvoice(tx, a.invoiceId)
      await activity(tx, organizationId, 'INVOICE', a.invoiceId, 'PAYMENT', `Payment of ${inr(a.amount)} received (receipt ${p.receiptNumber})`, req.user.id)
    }
    if (amount > 0) await tx.ledgerEntry.create({ data: { organizationId, entryDate: p.paymentDate, type: 'INCOME', amount, bankAccountId: p.bankAccountId, sourceType: 'PAYMENT', sourceId: p.id, description: `Receipt ${p.receiptNumber} from ${p.customer.name}` } })
    const customer = await tx.customer.findUnique({ where: { id: d.customerId }, select: { accountManagerId: true } })
    if (customer?.accountManagerId && customer.accountManagerId !== req.user.id) await notify(tx, organizationId, customer.accountManagerId, 'payment.received', `Payment of ${inr(amount)} received from ${p.customer.name}`, '/payments')
    await audit(tx, req, 'CREATE', M, 'Payment', p.id, null, { receipt: p.receiptNumber, amount, tds })
    return p
  })
  res.status(201).json(payment)
})

paymentsRouter.delete('/:id', authorize(M, 'DELETE'), async (req, res) => {
  const p = await prisma.payment.findFirst({ where: { id: String(req.params.id), organizationId: req.user.organizationId, AND: [await scoped(req, M, 'DELETE')] }, include: { allocations: true } })
  if (!p) throw notFound('Payment')
  await prisma.$transaction(async (tx) => {
    for (const a of p.allocations) {
      await tx.invoice.update({ where: { id: a.invoiceId }, data: { amountPaid: { decrement: a.amount }, tdsAmount: { decrement: a.tdsAmount } } })
      await recalcInvoice(tx, a.invoiceId)
      await activity(tx, p.organizationId, 'INVOICE', a.invoiceId, 'PAYMENT', `Payment ${p.receiptNumber} was deleted`, req.user.id)
    }
    await tx.ledgerEntry.deleteMany({ where: { sourceType: 'PAYMENT', sourceId: p.id } })
    await tx.payment.delete({ where: { id: p.id } })
    await audit(tx, req, 'DELETE', M, 'Payment', p.id, { receipt: p.receiptNumber, amount: p.amount }, null)
  })
  res.status(204).end()
})

export const bankAccountsRouter = crud({
  model: 'bankAccount', module: 'FINANCE', readModule: 'PAYMENTS', label: 'Bank account', orderBy: { name: 'asc' },
  fields: { name: 's', bankName: 's?', accountNumberLast4: 's?', ifsc: 's?', upiId: 's?', 'openingBalance?': 'n', 'isDefault?': 'b', 'isActive?': 'b' },
})
