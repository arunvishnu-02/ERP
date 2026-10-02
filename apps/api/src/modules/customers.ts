import { Router } from 'express'
import { authorize } from '../core/auth.js'
import { crud, findScoped } from '../core/crud.js'
import { activity, EXPORT_CODE, SCOPES, stateName, U } from '../core/util.js'
import { prisma } from '../db.js'
import * as E from '../generated/prisma/enums.js'

export const customersRouter = Router()
const M = 'CUSTOMERS'

customersRouter.get('/:id/history', authorize(M, 'VIEW'), async (req, res) => {
  const c = await findScoped(req, 'customer', M, 'VIEW', { soft: true, label: 'Customer' })
  const w = { customerId: c.id }
  const [projects, quotations, invoices, payments, webAssets, tickets] = await Promise.all([
    prisma.project.findMany({ where: { ...w, deletedAt: null }, select: { id: true, name: true, projectNumber: true, status: true, progressPercent: true }, orderBy: { createdAt: 'desc' } }),
    prisma.quotation.findMany({ where: { ...w, deletedAt: null, isLatest: true }, select: { id: true, quotationNumber: true, revision: true, status: true, totalAmount: true, issueDate: true }, orderBy: { createdAt: 'desc' } }),
    prisma.invoice.findMany({ where: { ...w, deletedAt: null }, select: { id: true, invoiceNumber: true, status: true, totalAmount: true, balanceDue: true, issueDate: true, dueDate: true }, orderBy: { createdAt: 'desc' } }),
    prisma.payment.findMany({ where: w, select: { id: true, receiptNumber: true, paymentDate: true, amount: true, method: true }, orderBy: { paymentDate: 'desc' } }),
    prisma.webAsset.findMany({ where: w, select: { id: true, name: true, type: true, expiryDate: true }, orderBy: { expiryDate: 'asc' } }),
    prisma.ticket.findMany({ where: w, select: { id: true, ticketNumber: true, subject: true, status: true }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ])
  res.json({ projects, quotations, invoices, payments, webAssets, tickets })
})

const applyState = (d: any) => {
  if (d.billingStateCode !== undefined) {
    d.billingState = stateName(d.billingStateCode)
    if (d.billingStateCode === EXPORT_CODE) d.isExport = true
  }
}

customersRouter.use('/:customerId/contacts', crud({
  model: 'contact', module: M, label: 'Contact', orderBy: [{ isPrimary: 'desc' }, { firstName: 'asc' }],
  fields: { firstName: 's', lastName: 's?', designation: 's?', email: 's?', phone: 's?', whatsappNumber: 's?', 'isPrimary?': 'b', 'isBillingContact?': 'b' },
  where: (req) => ({ customerId: (req.params as any).customerId }),
  beforeCreate: (d, req) => { d.customerId = (req.params as any).customerId },
}))

customersRouter.use('/', crud({
  model: 'customer', module: M, label: 'Customer', soft: true, by: true, number: ['customerNumber', 'CUSTOMER'], ownerField: 'accountManagerId', scope: SCOPES.CUSTOMERS,
  fields: {
    'type?': Object.values(E.CustomerType), name: 's', legalName: 's?', gstin: 's?', pan: 's?', industry: 's?', website: 's?', email: 's?', phone: 's?',
    billingAddressLine1: 's?', billingAddressLine2: 's?', billingCity: 's?', billingStateCode: 's?', billingPincode: 's?', 'isExport?': 'b', 'paymentTermsDays?': 'i',
    accountManagerId: 'id?', 'status?': Object.values(E.CustomerStatus),
  },
  search: ['name', 'customerNumber', 'email', 'phone', 'gstin'], filters: ['status', 'accountManagerId'],
  include: { accountManager: U, contacts: { orderBy: { isPrimary: 'desc' } } },
  orderBy: { name: 'asc' },
  beforeCreate: applyState,
  beforeUpdate: applyState,
  afterCreate: async (row, req, tx) => { await activity(tx, row.organizationId, 'CUSTOMER', row.id, 'CREATED', 'Customer added', req.user.id) },
  decorate: async (items) => {
    if (!items.length) return items
    const sums = await prisma.invoice.groupBy({ by: ['customerId'], where: { customerId: { in: items.map((i) => i.id) }, deletedAt: null, status: { notIn: ['DRAFT', 'VOID', 'CANCELLED'] } }, _sum: { totalAmount: true, balanceDue: true } })
    return items.map((i) => {
      const s = sums.find((x) => x.customerId === i.id)
      return { ...i, billed: Number(s?._sum.totalAmount ?? 0), outstanding: Number(s?._sum.balanceDue ?? 0) }
    })
  },
}))
