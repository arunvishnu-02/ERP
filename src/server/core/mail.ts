import nodemailer from 'nodemailer'
import { prisma } from '../db'
import { decrypt } from './util'

export async function smtpConfig(organizationId: string) {
  const s = await prisma.integrationSetting.findUnique({ where: { organizationId_provider: { organizationId, provider: 'SMTP' } } })
  if (!s || !s.isActive) return null
  const c = s.config as any
  return { host: String(c.host), port: Number(c.port), secure: !!c.secure, user: c.user as string | undefined, fromName: String(c.fromName), fromEmail: String(c.fromEmail), pass: decrypt(s) }
}

export interface MailInput {
  to: string
  subject: string
  text: string
  sentById?: string | null
  leadId?: string | null
  customerId?: string | null
  entityType?: string | null
  entityId?: string | null
}

/** Sends an email through the company's SMTP settings and records it in the message log either way. */
export async function sendMail(organizationId: string, m: MailInput) {
  const cfg = await smtpConfig(organizationId)
  let error: string | null = 'Email is not set up yet. Add the SMTP details under Settings.'
  if (cfg) {
    try {
      const t = nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.secure, auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined })
      await t.sendMail({ from: `"${cfg.fromName}" <${cfg.fromEmail}>`, to: m.to, subject: m.subject, text: m.text })
      error = null
    } catch (e: any) {
      error = String(e?.message ?? e).slice(0, 500)
    }
  }
  await prisma.message.create({
    data: {
      organizationId, channel: 'EMAIL', direction: 'OUTBOUND', fromAddress: cfg?.fromEmail ?? 'not set up', toAddress: m.to, subject: m.subject, body: m.text,
      status: error ? 'FAILED' : 'SENT', error, sentAt: error ? null : new Date(), sentById: m.sentById ?? null, leadId: m.leadId ?? null, customerId: m.customerId ?? null,
      entityType: (m.entityType as any) ?? null, entityId: m.entityId ?? null,
    },
  })
  return { sent: !error, error }
}

export async function template(organizationId: string, channel: 'EMAIL' | 'WHATSAPP', key: string) {
  return prisma.messageTemplate.findUnique({ where: { organizationId_channel_key: { organizationId, channel, key } } })
}
