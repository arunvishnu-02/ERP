import nodemailer from 'nodemailer'
import { prisma } from '../db'
import { decrypt } from './util'

export async function smtpConfig(organizationId: string) {
  const s = await prisma.integrationSetting.findUnique({ where: { organizationId_provider: { organizationId, provider: 'SMTP' } } })
  if (!s || !s.isActive) return null
  const c = s.config as any
  return { host: String(c.host), port: Number(c.port), secure: !!c.secure, user: c.user as string | undefined, fromName: String(c.fromName), fromEmail: String(c.fromEmail), pass: decrypt(s) }
}

/** Resend (resend.com) sends email through an API key instead of a mailbox. When it is switched on, it is used instead of SMTP. */
export async function resendConfig(organizationId: string) {
  const s = await prisma.integrationSetting.findUnique({ where: { organizationId_provider: { organizationId, provider: 'RESEND' } } })
  if (!s || !s.isActive || !s.secretCiphertext) return null
  const c = s.config as any
  return { fromName: String(c.fromName), fromEmail: String(c.fromEmail), apiKey: decrypt(s) }
}

async function viaResend(cfg: { fromName: string; fromEmail: string; apiKey: string }, m: MailInput) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${cfg.fromName} <${cfg.fromEmail}>`, to: [m.to], subject: m.subject, text: m.text }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!r.ok) {
    const b = (await r.json().catch(() => null)) as { message?: string } | null
    throw new Error(`Resend: ${b?.message ?? `error ${r.status}`}`)
  }
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
  /** What the message log keeps instead of the text, when the text holds a secret such as a sign-in code. */
  logText?: string
}

/** Sends an email through Resend when it is on, otherwise the company's SMTP mailbox, and records it in the message log either way. */
export async function sendMail(organizationId: string, m: MailInput) {
  const resend = await resendConfig(organizationId)
  const cfg = resend ?? (await smtpConfig(organizationId))
  let error: string | null = 'Email is not set up yet. Add Resend or your mailbox under Settings > Email.'
  if (cfg) {
    try {
      if (resend) await viaResend(resend, m)
      else {
        const c = cfg as NonNullable<Awaited<ReturnType<typeof smtpConfig>>>
        const t = nodemailer.createTransport({ host: c.host, port: c.port, secure: c.secure, auth: c.user ? { user: c.user, pass: c.pass } : undefined })
        await t.sendMail({ from: `"${c.fromName}" <${c.fromEmail}>`, to: m.to, subject: m.subject, text: m.text })
      }
      error = null
    } catch (e: any) {
      error = String(e?.message ?? e).slice(0, 500)
    }
  }
  await prisma.message.create({
    data: {
      organizationId, channel: 'EMAIL', direction: 'OUTBOUND', fromAddress: cfg?.fromEmail ?? 'not set up', toAddress: m.to, subject: m.logText ? m.subject.replace(/\d{6}/g, '••••••') : m.subject, body: m.logText ?? m.text,
      status: error ? 'FAILED' : 'SENT', error, sentAt: error ? null : new Date(), sentById: m.sentById ?? null, leadId: m.leadId ?? null, customerId: m.customerId ?? null,
      entityType: (m.entityType as any) ?? null, entityId: m.entityId ?? null,
    },
  })
  return { sent: !error, error }
}

export async function template(organizationId: string, channel: 'EMAIL' | 'WHATSAPP', key: string) {
  return prisma.messageTemplate.findUnique({ where: { organizationId_channel_key: { organizationId, channel, key } } })
}
