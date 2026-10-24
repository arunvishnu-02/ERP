import { prisma } from '../db'
import { env } from '../env'
import { fullName } from './auth'
import { newToken } from './docs'
import { docEmailHtml } from '../core/email-html'
import { sendMail, template } from './mail'
import { inr, render, ymd } from './util'

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
    const text = render(t?.body ?? 'Invoice {{number}} is overdue. {{link}}', vars)
    const html = await docEmailHtml(inv.organizationId, { kind: 'Payment reminder', heading: `Payment due for invoice ${vars.number}`, body: text, facts: [['Balance due', vars.amount], ['Due date', vars.due_date]], button: { label: 'View and pay invoice', url: vars.link }, automatic: !sentById })
    result = await sendMail(inv.organizationId, { to, subject: render(t?.subject ?? 'Payment reminder: {{number}}', vars), text, html, sentById, customerId: inv.customerId, entityType: 'INVOICE', entityId: inv.id })
  }
  await prisma.paymentReminder.create({ data: { organizationId: inv.organizationId, invoiceId: inv.id, channel: 'EMAIL', level, scheduledAt: new Date(), sentAt: result.sent ? new Date() : null, status: result.sent ? 'SENT' : 'FAILED' } })
  return result
}
