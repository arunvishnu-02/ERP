import { db, prisma } from '../db'
import { env } from '../env'
import { fullName } from './auth'
import { runRecurring } from './docs'
import { sendMail, template } from './mail'
import { remindInvoice } from './reminders'
import { addDays, dateOnly, daysBetween, hourNow, notify, render, today, todayStr, usersWith, ymd } from './util'

const OVERDUE_STEPS = [3, 10, 20, 30]
const RENEWAL_STEPS = [30, 15, 7, 1]

/** The once-a-day automations. Each one only runs when its rule is switched on in the Automation Center. */
export async function runDaily(organizationId: string) {
  const t = today()
  const summary = { followUps: 0, paymentReminders: 0, renewals: 0, recurringInvoices: 0 }
  const rules = await prisma.automationRule.findMany({ where: { organizationId, isActive: true } })
  const rule = (trigger: string) => rules.find((r) => r.trigger === trigger)
  const record = async (trigger: string, count: number) => {
    const r = rule(trigger)
    if (!r || !count) return
    await prisma.automationRule.update({ where: { id: r.id }, data: { runCount: { increment: count }, lastRunAt: new Date() } })
    await prisma.automationRun.create({ data: { organizationId, ruleId: r.id, status: 'SUCCEEDED', finishedAt: new Date(), log: { count } } })
  }
  const admins = await usersWith(db, organizationId, 'SETTINGS', 'EDIT')

  if (rule('FOLLOW_UP_DUE')) {
    const due = await prisma.followUp.findMany({
      where: { organizationId, status: 'PENDING', reminderSentAt: null, dueAt: { lt: addDays(t, 1) } },
      include: { lead: { select: { firstName: true, lastName: true, companyName: true } }, customer: { select: { name: true } }, deal: { select: { title: true } } },
    })
    for (const f of due) {
      const who = f.lead ? `${fullName(f.lead)}${f.lead.companyName ? `, ${f.lead.companyName}` : ''}` : f.customer?.name ?? f.deal?.title ?? 'a contact'
      await notify(db, organizationId, f.assignedToId, 'followup.due', `Follow-up due: ${who}`, f.lead ? '/leads' : '/sales')
      await prisma.followUp.update({ where: { id: f.id }, data: { reminderSentAt: new Date() } })
      summary.followUps++
    }
    await record('FOLLOW_UP_DUE', summary.followUps)
  }

  if (rule('INVOICE_OVERDUE')) {
    const overdue = await prisma.invoice.findMany({
      where: { organizationId, deletedAt: null, status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'] }, dueDate: { lt: t }, balanceDue: { gt: 0 } },
      include: { customer: { select: { name: true, accountManagerId: true } }, _count: { select: { paymentReminders: true } }, paymentReminders: { orderBy: { scheduledAt: 'desc' }, take: 1 } },
    })
    for (const inv of overdue) {
      const sent = inv._count.paymentReminders
      const days = daysBetween(t, inv.dueDate)
      const last = inv.paymentReminders[0]?.scheduledAt
      // At most one reminder every five days, so a long-overdue invoice is not chased daily.
      if (sent >= OVERDUE_STEPS.length || days < OVERDUE_STEPS[sent] || (last && Date.now() - last.getTime() < 5 * 864e5)) continue
      await remindInvoice(inv.id, sent + 1, null)
      for (const uid of inv.customer.accountManagerId ? [inv.customer.accountManagerId] : admins) await notify(db, organizationId, uid, 'invoice.overdue', `Invoice ${inv.invoiceNumber} for ${inv.customer.name} is ${days} days overdue`, '/payments')
      summary.paymentReminders++
    }
    await record('INVOICE_OVERDUE', summary.paymentReminders)
  }

  if (rule('RENEWAL_DUE')) {
    const assets = await prisma.webAsset.findMany({
      where: { organizationId, status: { in: ['ACTIVE', 'DUE_SOON', 'EXPIRED'] }, expiryDate: { lte: addDays(t, RENEWAL_STEPS[0]) } },
      include: { customer: { select: { id: true, name: true, email: true, accountManagerId: true, contacts: { where: { isPrimary: true }, take: 1 } } }, organization: { select: { name: true } } },
    })
    for (const a of assets) {
      const left = daysBetween(a.expiryDate, t)
      const lastLeft = a.lastReminderAt ? daysBetween(a.expiryDate, dateOnly(ymd(a.lastReminderAt))) : Infinity
      const crossed = RENEWAL_STEPS.some((s) => left <= s && lastLeft > s)
      const weeklyAfterExpiry = left < 0 && a.lastReminderAt !== null && daysBetween(t, dateOnly(ymd(a.lastReminderAt))) >= 7
      if (!crossed && !weeklyAfterExpiry) continue
      const what = `${a.name} (${a.type.toLowerCase().replace(/_/g, ' ')})`
      const when = left < 0 ? `expired ${-left} days ago` : left === 0 ? 'expires today' : `expires in ${left} days`
      for (const uid of a.customer.accountManagerId ? [a.customer.accountManagerId] : admins) await notify(db, organizationId, uid, 'renewal.due', `${what} for ${a.customer.name} ${when}`, '/websites')
      const contact = a.customer.contacts[0]
      const to = contact?.email ?? a.customer.email
      if (to && left >= 0) {
        const tpl = await template(organizationId, 'EMAIL', 'renewal_due')
        const vars = { contact: contact ? fullName(contact) : a.customer.name, asset: what, expiry: ymd(a.expiryDate), company: a.organization.name }
        await sendMail(organizationId, { to, subject: render(tpl?.subject ?? '{{asset}} expires on {{expiry}}', vars), text: render(tpl?.body ?? '{{asset}} expires on {{expiry}}', vars), customerId: a.customer.id, entityType: 'WEB_ASSET', entityId: a.id })
      }
      await prisma.webAsset.update({ where: { id: a.id }, data: { lastReminderAt: new Date(), status: left < 0 ? 'EXPIRED' : 'DUE_SOON' } })
      summary.renewals++
    }
    await record('RENEWAL_DUE', summary.renewals)
  }

  if (rule('SCHEDULE')) {
    const due = await prisma.recurringInvoice.findMany({ where: { organizationId, status: 'ACTIVE', nextRunDate: { lte: t } }, include: { customer: { select: { name: true } } } })
    const accounts = await usersWith(db, organizationId, 'INVOICES', 'CREATE')
    for (const r of due) {
      await prisma.$transaction(async (tx) => {
        await runRecurring(tx, r.id, null)
        for (const uid of accounts) await notify(tx, organizationId, uid, 'invoice.drafted', `Recurring invoice drafted for ${r.customer.name}: ${r.title}`, '/invoices')
      })
      summary.recurringInvoices++
    }
    await record('SCHEDULE', summary.recurringInvoices)
  }
  return summary
}

/** Runs the daily automations for every organization that has not had them today, after 9 in the morning (app timezone). */
async function tick() {
  try {
    for (const org of await prisma.organization.findMany({ select: { id: true, settings: true } })) {
      const s = ((org.settings as any) ?? {}) as Record<string, unknown>
      const day = todayStr()
      if (s.lastDailyRun === day || hourNow() < 9) continue
      await prisma.organization.update({ where: { id: org.id }, data: { settings: { ...s, lastDailyRun: day } as any } })
      console.log('Daily automations', await runDaily(org.id))
    }
  } catch (e) {
    console.error('Scheduler error', e)
  }
}

const store = globalThis as unknown as { __cxTimer?: ReturnType<typeof setInterval>; __cxLastCheck?: number }

/** Checks every ten minutes while the server is running. */
export function startScheduler() {
  if (store.__cxTimer || !env.runJobs) return
  store.__cxTimer = setInterval(tick, 10 * 60_000)
  store.__cxTimer.unref?.()
}

/**
 * Called on every API request. Some hosts stop an idle app, and timers stop with it,
 * so the first request after 9:00 also triggers the daily run. It never delays the request.
 */
export function maybeRunDaily() {
  if (!env.runJobs) return
  startScheduler()
  const now = Date.now()
  if (now - (store.__cxLastCheck ?? 0) < 10 * 60_000) return
  store.__cxLastCheck = now
  void tick()
}
