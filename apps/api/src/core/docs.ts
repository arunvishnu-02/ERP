import crypto from 'node:crypto'
import type { Tx } from '../db.js'
import { bad } from './http.js'
import { addDays, computeDoc, nextNumber, taxContext, today, type LineIn } from './util.js'

export const newToken = () => crypto.randomBytes(24).toString('base64url')

export interface InvoiceInput {
  customerId: string
  projectId?: string | null
  quotationId?: string | null
  recurringInvoiceId?: string | null
  issueDate?: Date | null
  dueDate?: Date | null
  notes?: string | null
  terms?: string | null
  items: LineIn[]
}

/** Creates a draft invoice. Its real number is issued when it is sent, so numbers stay in sequence. */
export async function createInvoice(tx: Tx, organizationId: string, userId: string | null, d: InvoiceInput) {
  const customer = await tx.customer.findFirst({ where: { id: d.customerId, organizationId, deletedAt: null } })
  if (!customer) throw bad('Choose a customer')
  const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { settings: true } })
  const ctx = await taxContext(tx, organizationId, { customerId: d.customerId })
  const { items, totals } = computeDoc(d.items, ctx)
  const issueDate = d.issueDate ?? today()
  return tx.invoice.create({
    data: {
      organizationId, invoiceNumber: `DRAFT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`, customerId: d.customerId, projectId: d.projectId ?? null,
      quotationId: d.quotationId ?? null, recurringInvoiceId: d.recurringInvoiceId ?? null, issueDate, dueDate: d.dueDate ?? addDays(issueDate, customer.paymentTermsDays),
      paymentTermsDays: customer.paymentTermsDays, placeOfSupply: ctx.placeOfSupply, isInterState: ctx.interState, ...totals, balanceDue: totals.totalAmount,
      notes: d.notes ?? null, terms: d.terms ?? (org.settings as any)?.invoiceTerms ?? null, createdById: userId,
      items: { create: items.map((it, i) => ({ ...it, milestoneId: d.items[i].milestoneId ?? null })) },
    },
    include: { items: true },
  })
}

/** Gives a draft its real number and marks it sent. */
export async function issueInvoice(tx: Tx, inv: { id: string; organizationId: string; invoiceNumber: string; status: string; publicToken: string | null }) {
  return tx.invoice.update({
    where: { id: inv.id },
    data: {
      invoiceNumber: inv.invoiceNumber.startsWith('DRAFT-') ? await nextNumber(tx, inv.organizationId, 'INVOICE') : inv.invoiceNumber,
      status: inv.status === 'DRAFT' ? 'SENT' : (inv.status as any), sentAt: new Date(), publicToken: inv.publicToken ?? newToken(),
    },
  })
}

/** Recomputes balance and status after a payment or credit note changes. */
export async function recalcInvoice(tx: Tx, invoiceId: string) {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } })
  const settled = Number(inv.amountPaid) + Number(inv.tdsAmount) + Number(inv.creditedAmount)
  const balance = Math.max(0, Math.round((Number(inv.totalAmount) - settled) * 100) / 100)
  if (inv.status === 'DRAFT' || inv.status === 'VOID' || inv.status === 'CANCELLED') return inv
  const status = balance <= 0.005 ? 'PAID' : settled > 0 ? 'PARTIALLY_PAID' : 'SENT'
  return tx.invoice.update({ where: { id: invoiceId }, data: { balanceDue: balance, status, paidAt: status === 'PAID' ? inv.paidAt ?? new Date() : null } })
}

const STEP: Record<string, number> = { MONTHLY: 1, QUARTERLY: 3, HALF_YEARLY: 6, YEARLY: 12, ONE_TIME: 0 }
/** Drafts the invoice for a recurring schedule and moves its next date forward. */
export async function runRecurring(tx: Tx, id: string, userId: string | null) {
  const r = await tx.recurringInvoice.findUniqueOrThrow({ where: { id }, include: { items: true } })
  const inv = await createInvoice(tx, r.organizationId, userId, {
    customerId: r.customerId, projectId: r.projectId, recurringInvoiceId: r.id,
    items: r.items.map((i) => ({ serviceId: i.serviceId, description: `${i.description}`, sacCode: i.sacCode, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), taxRate: Number(i.taxRate) })),
    notes: r.title,
  })
  const months = STEP[r.frequency] * r.intervalCount
  const next = new Date(r.nextRunDate)
  next.setUTCMonth(next.getUTCMonth() + months)
  const ended = months === 0 || (r.endDate && next > r.endDate)
  await tx.recurringInvoice.update({ where: { id }, data: { lastRunDate: today(), nextRunDate: ended ? r.nextRunDate : next, status: ended ? 'ENDED' : r.status } })
  return inv
}
