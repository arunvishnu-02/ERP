// The client portal: a customer's contacts sign in with a code sent to their email and see
// their own quotations, invoices, projects and support tickets. Nothing here uses staff sessions.
import crypto from 'node:crypto'
import { Router, rateLimit, type NextFunction, type Request, type Response } from '../core/router'
import { sha } from '../core/auth'
import { bad, HttpError, notFound, parse, shape } from '../core/http'
import { sendMail } from '../core/mail'
import { activity, nextNumber, notify, usersWith } from '../core/util'
import { prisma } from '../db'
import { env } from '../env'

export const portalRouter = Router()

const COOKIE = 'cx_portal'
const LIFETIME = 30 * 864e5
const CODE_MINUTES = 15
const CODE_TRIES = 5
const cookieOptions = () => ({ httpOnly: true, sameSite: 'lax' as const, secure: env.cookieSecure, path: '/' })
const limiter = rateLimit({ windowMs: 60_000, limit: 10, message: { message: 'Too many attempts. Wait a minute and try again.' } })
const codeHash = (contactId: string, code: string) => sha(`portal:${contactId}:${code}`)
const findContact = (email: string) =>
  prisma.contact.findFirst({
    where: { email: email.toLowerCase().trim(), portalAccess: true, customer: { deletedAt: null } },
    include: { organization: { select: { name: true } } }, orderBy: { updatedAt: 'desc' },
  })

interface PortalContact { id: string; organizationId: string; customerId: string; firstName: string; lastName: string | null; email: string | null }
const who = (req: Request) => (req as any).contact as PortalContact

/** The company's name and logo for the sign-in page. */
portalRouter.get('/auth/brand', async (_req, res) => {
  const o = await prisma.organization.findFirst({ select: { name: true, settings: true }, orderBy: { createdAt: 'asc' } })
  res.json({ name: o?.name ?? '', logo: (o?.settings as any)?.logo ?? null })
})

/** Always answers the same way, so nobody can use it to find out which emails have access. */
portalRouter.post('/auth/code', limiter, async (req, res) => {
  const d = parse(shape({ email: 's' }), req.body)
  const c = await findContact(d.email)
  if (c?.email) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
    await prisma.$transaction([
      prisma.portalCode.updateMany({ where: { contactId: c.id, usedAt: null }, data: { usedAt: new Date() } }),
      prisma.portalCode.create({ data: { contactId: c.id, codeHash: codeHash(c.id, code), expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000) } }),
    ])
    await sendMail(c.organizationId, {
      to: c.email, customerId: c.customerId, logText: 'Client portal sign-in code sent. The code itself is not kept.',
      subject: `${code} is your ${c.organization.name} sign-in code`,
      text: `Hello ${c.firstName},\n\nUse this code to sign in to the ${c.organization.name} client portal: ${code}\n\nIt works for ${CODE_MINUTES} minutes. If you did not ask for it, you can ignore this email.\n\n${env.appUrl}/portal\n${c.organization.name}`,
    })
  }
  res.json({ ok: true, minutes: CODE_MINUTES })
})

portalRouter.post('/auth/verify', limiter, async (req, res) => {
  const d = parse(shape({ email: 's', code: 's' }), req.body)
  const wrong = () => bad('This code is not right or has expired. Ask for a new one.')
  const c = await findContact(d.email)
  if (!c) throw wrong()
  const pc = await prisma.portalCode.findFirst({ where: { contactId: c.id, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } })
  if (!pc) throw wrong()
  if (pc.codeHash !== codeHash(c.id, d.code.replace(/\D/g, ''))) {
    const tries = pc.tries + 1
    await prisma.portalCode.update({ where: { id: pc.id }, data: { tries, ...(tries >= CODE_TRIES ? { usedAt: new Date() } : {}) } })
    throw tries >= CODE_TRIES ? bad('Too many wrong codes. Ask for a new one.') : wrong()
  }
  const raw = crypto.randomBytes(32).toString('base64url')
  await prisma.$transaction([
    prisma.portalCode.update({ where: { id: pc.id }, data: { usedAt: new Date() } }),
    prisma.portalSession.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    prisma.portalSession.create({ data: { contactId: c.id, tokenHash: sha(raw), expiresAt: new Date(Date.now() + LIFETIME) } }),
    prisma.contact.update({ where: { id: c.id }, data: { portalLastSeenAt: new Date() } }),
  ])
  res.cookie(COOKIE, raw, { ...cookieOptions(), maxAge: LIFETIME })
  res.json({ ok: true })
})

portalRouter.post('/auth/logout', async (req, res) => {
  const raw = req.cookies[COOKIE]
  if (raw) await prisma.portalSession.deleteMany({ where: { tokenHash: sha(raw) } })
  res.clearCookie(COOKIE, cookieOptions())
  res.status(204).end()
})

/** Everything below needs a signed-in contact whose access is still switched on. */
portalRouter.use(async (req: Request, res: Response, next: NextFunction) => {
  const raw = req.cookies[COOKIE]
  if (!raw) throw new HttpError(401, 'Sign in to continue')
  const s = await prisma.portalSession.findUnique({ where: { tokenHash: sha(raw) }, include: { contact: { include: { customer: { select: { deletedAt: true } } } } } })
  if (!s || s.expiresAt < new Date() || !s.contact.portalAccess || s.contact.customer.deletedAt) throw new HttpError(401, 'Your session has expired')
  if (Date.now() - s.lastUsedAt.getTime() > 864e5) {
    await prisma.$transaction([
      prisma.portalSession.update({ where: { id: s.id }, data: { lastUsedAt: new Date(), expiresAt: new Date(Date.now() + LIFETIME) } }),
      prisma.contact.update({ where: { id: s.contactId }, data: { portalLastSeenAt: new Date() } }),
    ])
    res.cookie(COOKIE, raw, { ...cookieOptions(), maxAge: LIFETIME })
  }
  ;(req as any).contact = s.contact
  next()
})

const QUOTE_SHOWN = ['SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CONVERTED'] as const
const INVOICE_HIDDEN = ['DRAFT', 'VOID'] as const
const UNPAID = ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'] as const
const quoteList = (c: PortalContact) => prisma.quotation.findMany({
  where: { organizationId: c.organizationId, customerId: c.customerId, deletedAt: null, isLatest: true, status: { in: [...QUOTE_SHOWN] } },
  select: { id: true, quotationNumber: true, title: true, issueDate: true, validUntil: true, status: true, totalAmount: true, publicToken: true }, orderBy: { issueDate: 'desc' },
})
const invoiceList = (c: PortalContact) => prisma.invoice.findMany({
  where: { organizationId: c.organizationId, customerId: c.customerId, deletedAt: null, status: { notIn: [...INVOICE_HIDDEN] } },
  select: { id: true, invoiceNumber: true, issueDate: true, dueDate: true, status: true, totalAmount: true, amountPaid: true, balanceDue: true, publicToken: true, project: { select: { name: true } } }, orderBy: { issueDate: 'desc' },
})
// links open the existing customer pages, where a quotation can be accepted and an invoice printed or paid
const withLink = <T extends { publicToken: string | null }>(rows: T[], path: 'q' | 'i') => rows.map(({ publicToken, ...r }) => ({ ...r, link: publicToken ? `/${path}/${publicToken}` : null }))

portalRouter.get('/me', async (req, res) => {
  const c = who(req)
  const [org, customer] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: c.organizationId }, select: { name: true, email: true, phone: true, settings: true } }),
    prisma.customer.findUniqueOrThrow({ where: { id: c.customerId }, select: { name: true } }),
  ])
  const s = (org.settings ?? {}) as any
  res.json({ contact: { id: c.id, firstName: c.firstName, lastName: c.lastName, email: c.email }, customer, organization: { name: org.name, email: org.email, phone: org.phone, logo: s.logo ?? null, tagline: s.tagline ?? null } })
})

portalRouter.get('/home', async (req, res) => {
  const c = who(req)
  const [quotes, invoices, projects, tickets] = await Promise.all([
    quoteList(c), invoiceList(c),
    prisma.project.findMany({ where: { organizationId: c.organizationId, customerId: c.customerId, deletedAt: null, status: { notIn: ['CANCELLED'] } }, select: { id: true, name: true, status: true, progressPercent: true, dueDate: true }, orderBy: { updatedAt: 'desc' } }),
    prisma.ticket.findMany({ where: { organizationId: c.organizationId, customerId: c.customerId, status: { notIn: ['CLOSED'] } }, select: { id: true, ticketNumber: true, subject: true, status: true, updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
  ])
  const unpaid = invoices.filter((i) => (UNPAID as readonly string[]).includes(i.status))
  res.json({
    toDecide: withLink(quotes.filter((q) => ['SENT', 'VIEWED'].includes(q.status)), 'q'),
    unpaid: withLink(unpaid, 'i'),
    balanceDue: unpaid.reduce((n, i) => n + Number(i.balanceDue), 0),
    projects: projects.filter((p) => p.status !== 'COMPLETED'),
    tickets: tickets.filter((t) => t.status !== 'RESOLVED'),
  })
})

portalRouter.get('/quotations', async (req, res) => res.json({ items: withLink(await quoteList(who(req)), 'q') }))
portalRouter.get('/invoices', async (req, res) => res.json({ items: withLink(await invoiceList(who(req)), 'i') }))

portalRouter.get('/projects', async (req, res) => {
  const c = who(req)
  const items = await prisma.project.findMany({
    where: { organizationId: c.organizationId, customerId: c.customerId, deletedAt: null, status: { notIn: ['CANCELLED'] } },
    select: {
      id: true, projectNumber: true, name: true, description: true, status: true, progressPercent: true, startDate: true, dueDate: true, completedAt: true,
      manager: { select: { firstName: true, lastName: true } },
      milestones: { select: { id: true, name: true, status: true, dueDate: true, completedAt: true }, orderBy: { position: 'asc' } },
    },
    orderBy: [{ completedAt: { sort: 'asc', nulls: 'first' } }, { updatedAt: 'desc' }],
  })
  res.json({ items })
})

// ── Support tickets ──
const ticketOf = async (req: Request) => {
  const c = who(req)
  const t = await prisma.ticket.findFirst({ where: { id: String(req.params.id), organizationId: c.organizationId, customerId: c.customerId }, select: { id: true, ticketNumber: true, subject: true, description: true, status: true, priority: true, createdAt: true, assigneeId: true, organizationId: true } })
  if (!t) throw notFound('Ticket')
  return t
}
/** The people to tell about a client's message: the ticket's assignee, else the account manager, else everyone who handles tickets. */
async function staffFor(tx: any, c: PortalContact, assigneeId: string | null) {
  if (assigneeId) return [assigneeId]
  const cust = await tx.customer.findUnique({ where: { id: c.customerId }, select: { accountManagerId: true } })
  return cust?.accountManagerId ? [cust.accountManagerId] : usersWith(tx, c.organizationId, 'TICKETS', 'EDIT')
}

portalRouter.get('/tickets', async (req, res) => {
  const c = who(req)
  res.json({ items: await prisma.ticket.findMany({ where: { organizationId: c.organizationId, customerId: c.customerId }, select: { id: true, ticketNumber: true, subject: true, status: true, priority: true, createdAt: true, updatedAt: true }, orderBy: { updatedAt: 'desc' } }) })
})

portalRouter.post('/tickets', async (req, res) => {
  const c = who(req)
  const d = parse(shape({ subject: 's', description: 's', 'priority?': ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] }), req.body)
  const t = await prisma.$transaction(async (tx) => {
    const row = await tx.ticket.create({
      data: { organizationId: c.organizationId, ticketNumber: await nextNumber(tx, c.organizationId, 'TICKET'), customerId: c.customerId, contactId: c.id, subject: d.subject.slice(0, 500), description: d.description, priority: d.priority ?? 'MEDIUM', channel: 'PORTAL' },
    })
    await activity(tx, c.organizationId, 'TICKET', row.id, 'CREATED', `Opened by ${c.firstName} in the client portal`)
    for (const uid of await staffFor(tx, c, null)) await notify(tx, c.organizationId, uid, 'ticket.portal', `New ticket ${row.ticketNumber} from a client: ${row.subject}`, '/tickets')
    return row
  })
  res.status(201).json({ id: t.id, ticketNumber: t.ticketNumber, subject: t.subject, status: t.status })
})

portalRouter.get('/tickets/:id', async (req, res) => {
  const t = await ticketOf(req)
  const comments = await prisma.comment.findMany({
    where: { organizationId: t.organizationId, entityType: 'TICKET', entityId: t.id, isInternal: false, deletedAt: null },
    select: { id: true, body: true, createdAt: true, author: { select: { firstName: true } }, contact: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: 'asc' },
  })
  const { assigneeId, organizationId, ...ticket } = t
  // staff are shown by first name only, the way a support desk signs its emails
  res.json({ ...ticket, messages: comments.map((m) => ({ id: m.id, body: m.body, createdAt: m.createdAt, fromClient: !!m.contact, name: m.contact ? [m.contact.firstName, m.contact.lastName].filter(Boolean).join(' ') : m.author?.firstName ?? 'Support' })) })
})

portalRouter.post('/tickets/:id/reply', async (req, res) => {
  const c = who(req)
  const d = parse(shape({ body: 's' }), req.body)
  const t = await ticketOf(req)
  if (t.status === 'CLOSED') throw bad('This ticket is closed. Open a new ticket if you need more help.')
  await prisma.$transaction(async (tx) => {
    await tx.comment.create({ data: { organizationId: t.organizationId, entityType: 'TICKET', entityId: t.id, body: d.body, isInternal: false, contactId: c.id } })
    // a reply from the client puts a waiting or resolved ticket back in the team's queue
    if (['WAITING_ON_CUSTOMER', 'RESOLVED'].includes(t.status)) {
      await tx.ticket.update({ where: { id: t.id }, data: { status: 'IN_PROGRESS', resolvedAt: null } })
      await activity(tx, t.organizationId, 'TICKET', t.id, 'STATUS_CHANGED', 'Status changed to in progress after the client replied')
    }
    await activity(tx, t.organizationId, 'TICKET', t.id, 'COMMENT', `${c.firstName} replied in the client portal`)
    for (const uid of await staffFor(tx, c, t.assigneeId)) await notify(tx, t.organizationId, uid, 'ticket.reply', `${c.firstName} replied on ticket ${t.ticketNumber}`, '/tickets')
  })
  res.status(201).json({ ok: true })
})
