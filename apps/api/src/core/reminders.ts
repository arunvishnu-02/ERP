import { prisma } from '../db.js'
import { env } from '../env.js'
import { fullName } from './auth.js'
import { newToken } from './docs.js'
import { sendMail, template } from './mail.js'
import { inr, render, ymd } from './util.js'

/** Emails a payment reminder for one invoice and records it. Works without SMTP too: the attempt is logged as failed. */
export async function remindInvoice(invoiceId: string, level: number, sentById: string | null) {
  let inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { customer: { include: { contacts: { where: { isPrimary: true }, take: 1 } } }, organization: true } })
  if (!inv.publicToken) inv = { ...inv, ...(await prisma.invoice.update({ where: { id: inv.id }, data: { publicToken: newToken() } })) }
  const contact = inv.customer.contacts[0]
  const to = contact?.email ?? inv.customer.email
  let result = { sent: false, error: 'This customer has no email address' as string | null }
  if (to) {
    const t = await template(inv.organizationId, 'EMAIL', 'payment_reminder')
    const vars = { contact: contact ? fullName(contact) : inv.customer.name, number: inv.invoiceNumber, amount: inr(Number(inv.balanceDue)), due_date: ymd(inv.dueDate), link: `${env.appUrl}/i/${inv.publicToken}`, company: inv.organization.name }
    result = await sendMail(inv.organizationId, { to, subject: render(t?.subject ?? 'Payment reminder: {{number}}', vars), text: render(t?.body ?? 'Invoice {{number}} is overdue. {{link}}', vars), sentById, customerId: inv.customerId, entityType: 'INVOICE', entityId: inv.id })
  }
  await prisma.paymentReminder.create({ data: { organizationId: inv.organizationId, invoiceId: inv.id, channel: 'EMAIL', level, scheduledAt: new Date(), sentAt: result.sent ? new Date() : null, status: result.sent ? 'SENT' : 'FAILED' } })
  return result
}
