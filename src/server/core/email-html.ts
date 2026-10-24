import { prisma } from '../db'

// Branded HTML emails in the house style: navy and cyan, the company name at the top and the contact details at the bottom.
// Email apps ignore most CSS, so everything is tables and inline styles.

const NAVY = '#08043a'
const CYAN = '#02a6dc'
const MUTED = '#6b7280'

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

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
  button?: { label: string; url: string }
}

/** A one-time code email: the code in large spaced digits, how long it works, and the company footer. */
export async function codeEmailHtml(organizationId: string, e: CodeEmail) {
  const o = await prisma.organization.findUnique({ where: { id: organizationId } })
  const s = (o?.settings as any) ?? {}
  const name = o?.name ?? ''
  const legal = o?.legalName || name
  const address = [o?.addressLine1, o?.addressLine2, o?.city, [o?.state, o?.pincode].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const contact = [o?.phone, o?.email, s.website].filter(Boolean).map(esc).join(' &nbsp;|&nbsp; ')
  const digits = esc(e.code).split('').join('&#8202;')
  const button = e.button
    ? `<tr><td align="center" style="padding:4px 0 8px"><a href="${esc(e.button.url)}" style="display:inline-block;background:${NAVY};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 26px;border-radius:8px">${esc(e.button.label)}</a></td></tr>`
    : ''
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(e.heading)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f8;font-family:Poppins,Segoe UI,Helvetica,Arial,sans-serif;color:#111827">
<div style="display:none;max-height:0;overflow:hidden">${esc(e.code)} is your code. It works for ${e.minutes} minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f8;padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb">
  <tr><td style="background:${NAVY};padding:22px 28px">
    <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:.3px">${esc(name)}</div>
    ${s.tagline ? `<div style="color:${CYAN};font-size:12px;margin-top:2px">${esc(s.tagline)}</div>` : ''}
  </td></tr>
  <tr><td style="height:4px;background:${CYAN};line-height:4px;font-size:0">&nbsp;</td></tr>
  <tr><td style="padding:30px 28px 8px">
    <h1 style="margin:0 0 14px;font-size:22px;color:${NAVY}">${esc(e.heading)}</h1>
    <p style="margin:0 0 6px;font-size:15px;line-height:1.6">Hello${e.firstName ? ` ${esc(e.firstName)}` : ''},</p>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.6">${esc(e.intro)}</p>
  </td></tr>
  <tr><td align="center" style="padding:0 28px">
    <div style="display:inline-block;background:#eef8fc;border:1px dashed ${CYAN};border-radius:12px;padding:16px 26px;font-size:34px;font-weight:700;letter-spacing:10px;color:${NAVY};font-family:Consolas,Menlo,monospace">${digits}</div>
    <p style="margin:12px 0 22px;font-size:13px;color:${MUTED}">This code works for ${e.minutes} minutes. Do not share it with anyone.</p>
  </td></tr>
  <tr><td><table role="presentation" width="100%">${button}</table></td></tr>
  <tr><td style="padding:6px 28px 28px">
    <p style="margin:0;font-size:13px;line-height:1.6;color:${MUTED}">${esc(e.note)}</p>
    <p style="margin:18px 0 0;font-size:14px">Regards,<br><strong style="color:${NAVY}">${esc(legal)}</strong></p>
  </td></tr>
  <tr><td style="background:#f8f9fc;border-top:1px solid #e5e7eb;padding:16px 28px;font-size:11.5px;line-height:1.6;color:${MUTED}">
    ${contact ? `<div>${contact}</div>` : ''}
    ${address ? `<div>${esc(address)}</div>` : ''}
    <div style="margin-top:6px">This is an automatic email. Please do not reply to it.</div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
}
