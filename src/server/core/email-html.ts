import { prisma } from '../db'

// Branded HTML emails in the house style: navy and cyan, the company name at the top and the contact details at the bottom.
// Email apps ignore most CSS, so everything is tables and inline styles.

const NAVY = '#08043a'
const CYAN = '#02a6dc'
const MUTED = '#6b7280'

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

type Button = { label: string; url: string }

const buttonHtml = (b?: Button) =>
  b ? `<tr><td align="center" style="padding:6px 28px 22px"><a href="${esc(b.url)}" style="display:inline-block;background:${NAVY};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 26px;border-radius:8px">${esc(b.label)}</a></td></tr>` : ''

/** The frame every email shares: header with name and tagline, a cyan rule, the content rows, and the contact footer. */
async function shell(organizationId: string, o: { title: string; preheader: string; automatic?: boolean }) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } })
  const s = (org?.settings as any) ?? {}
  const name = org?.name ?? ''
  const address = [org?.addressLine1, org?.addressLine2, org?.city, [org?.state, org?.pincode].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const contact = [org?.phone, org?.email, s.website].filter(Boolean).map(esc).join(' &nbsp;|&nbsp; ')
  return {
    legal: org?.legalName || name,
    html: (rows: string) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.title)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f8;font-family:Poppins,Segoe UI,Helvetica,Arial,sans-serif;color:#111827">
<div style="display:none;max-height:0;overflow:hidden">${esc(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f8;padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb">
  <tr><td style="background:${NAVY};padding:22px 28px">
    <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:.3px">${esc(name)}</div>
    ${s.tagline ? `<div style="color:${CYAN};font-size:12px;margin-top:2px">${esc(s.tagline)}</div>` : ''}
  </td></tr>
  <tr><td style="height:4px;background:${CYAN};line-height:4px;font-size:0">&nbsp;</td></tr>
  ${rows}
  <tr><td style="background:#f8f9fc;border-top:1px solid #e5e7eb;padding:16px 28px;font-size:11.5px;line-height:1.6;color:${MUTED}">
    ${contact ? `<div>${contact}</div>` : ''}
    ${address ? `<div>${esc(address)}</div>` : ''}
    ${o.automatic ? '<div style="margin-top:6px">This is an automatic email. Please do not reply to it.</div>' : ''}
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
  }
}

interface CodeEmail {
  /** The big line at the top, like "Reset your password". */
  heading: string
  /** The person's first name, for "Hello Arun,". */
  firstName?: string | null
  /** One or two sentences above the code. */
  intro: string
  code: string
  minutes: number
  /** A line under the code, like what to do if they did not ask for it. */
  note: string
  /** An optional button under the code. */
  button?: Button
}

/** A one-time code email: the code in large spaced digits, how long it works, and the company footer. */
export async function codeEmailHtml(organizationId: string, e: CodeEmail) {
  const sh = await shell(organizationId, { title: e.heading, preheader: `${e.code} is your code. It works for ${e.minutes} minutes.`, automatic: true })
  const digits = esc(e.code).split('').join('&#8202;')
  return sh.html(`
  <tr><td style="padding:30px 28px 8px">
    <h1 style="margin:0 0 14px;font-size:22px;color:${NAVY}">${esc(e.heading)}</h1>
    <p style="margin:0 0 6px;font-size:15px;line-height:1.6">Hello${e.firstName ? ` ${esc(e.firstName)}` : ''},</p>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.6">${esc(e.intro)}</p>
  </td></tr>
  <tr><td align="center" style="padding:0 28px">
    <div style="display:inline-block;background:#eef8fc;border:1px dashed ${CYAN};border-radius:12px;padding:16px 26px;font-size:34px;font-weight:700;letter-spacing:10px;color:${NAVY};font-family:Consolas,Menlo,monospace">${digits}</div>
    <p style="margin:12px 0 22px;font-size:13px;color:${MUTED}">This code works for ${e.minutes} minutes. Do not share it with anyone.</p>
  </td></tr>
  ${buttonHtml(e.button)}
  <tr><td style="padding:6px 28px 28px">
    <p style="margin:0;font-size:13px;line-height:1.6;color:${MUTED}">${esc(e.note)}</p>
    <p style="margin:18px 0 0;font-size:14px">Regards,<br><strong style="color:${NAVY}">${esc(sh.legal)}</strong></p>
  </td></tr>`)
}

interface DocEmail {
  /** Small cyan label above the heading, like "Invoice" or "Payment reminder". */
  kind: string
  /** The big line, like "Invoice CX/INV/2026-27/0004". */
  heading: string
  /** The message itself, as plain text. Blank lines start a new paragraph and web addresses become links. */
  body: string
  /** Label and value pairs shown in a pale box, like amount and due date. Empty values are left out. */
  facts?: [string, string | null | undefined][]
  /** The main button, like "View invoice". Its address is taken out of the text so it is not shown twice. */
  button?: Button
  /** Shows "This is an automatic email" in the footer, for emails nobody wrote by hand. */
  automatic?: boolean
}

const linkify = (escaped: string) => escaped.replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:${CYAN};word-break:break-all">${u}</a>`)

/** An email about a document or a message from the team: the text in paragraphs, an optional facts box and button, and the company footer. */
export async function docEmailHtml(organizationId: string, e: DocEmail) {
  let body = e.body
  if (e.button) body = body.split('\n').filter((l) => l.trim() !== e.button!.url).join('\n').replace(e.button.url, '')
  const paras = body.trim().split(/\n\s*\n/).map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65">${linkify(esc(p.trim())).replace(/\n/g, '<br>')}</p>`).join('')
  const facts = (e.facts ?? []).filter(([, v]) => v)
  const factsHtml = facts.length
    ? `<tr><td style="padding:4px 28px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef8fc;border-radius:10px">${facts
        .map(([k, v]) => `<tr><td style="padding:9px 16px;font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:.6px">${esc(k)}</td><td align="right" style="padding:9px 16px;font-size:14px;font-weight:700;color:${NAVY}">${esc(v)}</td></tr>`)
        .join('')}</table></td></tr>`
    : ''
  const firstLine = body.trim().split('\n')[0] ?? ''
  const sh = await shell(organizationId, { title: e.heading, preheader: firstLine.slice(0, 120), automatic: e.automatic })
  return sh.html(`
  <tr><td style="padding:28px 28px 6px">
    <div style="font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${CYAN};margin-bottom:6px">${esc(e.kind)}</div>
    <h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:${NAVY}">${esc(e.heading)}</h1>
    ${paras}
  </td></tr>
  ${factsHtml}
  ${buttonHtml(e.button)}
  <tr><td style="height:8px;font-size:0;line-height:8px">&nbsp;</td></tr>`)
}
