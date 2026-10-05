// Digital marketing, website management and support tickets.
import { Router } from '../core/router'
import { authorize, fullName } from '../core/auth'
import { crud, findScoped } from '../core/crud'
import { createInvoice } from '../core/docs'
import { bad, notFound, parse, shape, stripNulls } from '../core/http'
import { sendMail } from '../core/mail'
import { activity, audit, daysBetween, decrypt, encrypt, notify, SCOPES, today, U } from '../core/util'
import { prisma } from '../db'
import * as E from '../../generated/prisma/enums'

const customer = { select: { id: true, name: true } }

// ── Digital marketing ──
export const campaignsRouter = crud({
  model: 'campaign', module: 'MARKETING', label: 'Campaign', soft: true, ownerField: 'managerId', scope: SCOPES.CAMPAIGNS,
  fields: { customerId: 'id', projectId: 'id?', name: 's', objective: 's?', 'platforms?': 's[]', 'status?': Object.values(E.CampaignStatus), startDate: 'd', endDate: 'd?', budget: 'n?', managerId: 'id?' },
  search: ['name', 'customer.name'], filters: ['status', 'customerId', 'managerId'], include: { customer, manager: U },
  decorate: async (items) => {
    if (!items.length) return items
    const sums = await prisma.adSpend.groupBy({ by: ['campaignId'], where: { campaignId: { in: items.map((i) => i.id) } }, _sum: { amount: true, leads: true, clicks: true, impressions: true } })
    return items.map((i) => {
      const s = sums.find((x) => x.campaignId === i.id)?._sum
      return { ...i, spent: Number(s?.amount ?? 0), leads: s?.leads ?? 0, clicks: s?.clicks ?? 0, impressions: s?.impressions ?? 0 }
    })
  },
})
export const contentRouter = crud({
  model: 'contentItem', module: 'MARKETING', label: 'Content', scope: SCOPES.CONTENT,
  fields: { customerId: 'id', campaignId: 'id?', type: Object.values(E.ContentType), title: 's', caption: 's?', platform: Object.values(E.SocialPlatform), scheduledAt: 'd?', 'status?': Object.values(E.ContentStatus), assigneeId: 'id?', postUrl: 's?' },
  search: ['title', 'customer.name'], filters: ['status', 'type', 'customerId', 'campaignId', 'assigneeId'], dateField: 'scheduledAt',
  include: { customer, campaign: { select: { id: true, name: true } }, assignee: U }, orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
  afterCreate: async (row, req, tx) => {
    if (row.assigneeId && row.assigneeId !== req.user.id) await notify(tx, row.organizationId, row.assigneeId, 'content.assigned', `Content assigned to you: ${row.title}`, '/marketing')
  },
  beforeUpdate: async (d, before, req, tx) => {
    if (d.status && d.status !== before.status) {
      if (d.status === 'PUBLISHED') d.publishedAt = new Date()
      if (d.status === 'REJECTED') d.revisionCount = before.revisionCount + 1
      await activity(tx, before.organizationId, 'CONTENT_ITEM', before.id, 'STATUS_CHANGED', `${before.title}: moved to ${String(d.status).toLowerCase().replace(/_/g, ' ')}`, req.user.id)
    }
    if (d.assigneeId && d.assigneeId !== before.assigneeId && d.assigneeId !== req.user.id) await notify(tx, before.organizationId, d.assigneeId, 'content.assigned', `Content assigned to you: ${before.title}`, '/marketing')
  },
})
export const adSpendRouter = crud({
  model: 'adSpend', module: 'MARKETING', label: 'Ad spend', orderBy: { spendDate: 'desc' }, filters: ['campaignId', 'platform'], dateField: 'spendDate',
  fields: { campaignId: 'id', platform: Object.values(E.SocialPlatform), spendDate: 'd', amount: 'n', impressions: 'i?', clicks: 'i?', leads: 'i?', conversions: 'i?' },
  include: { campaign: { select: { id: true, name: true } } },
})

// ── Websites, renewals and credentials ──
export const websitesRouter = crud({
  model: 'website', module: 'WEBSITES', label: 'Website', orderBy: { name: 'asc' }, search: ['name', 'url', 'customer.name'], filters: ['status', 'customerId'],
  fields: { customerId: 'id', projectId: 'id?', name: 's', url: 's', platform: 's?', 'status?': Object.values(E.WebsiteStatus), notes: 's?' }, include: { customer },
})

export const webAssetsRouter = Router()
webAssetsRouter.post('/:id/renew', authorize('WEBSITES', 'EDIT'), async (req, res) => {
  const d = parse(shape({ 'years?': 'i', 'createInvoice?': 'b' }), req.body)
  const a = await prisma.webAsset.findFirst({ where: { id: String(req.params.id), organizationId: req.user.organizationId } })
  if (!a) throw notFound('Renewal')
  const from = a.expiryDate > today() ? new Date(a.expiryDate) : today()
  from.setUTCFullYear(from.getUTCFullYear() + Math.max(1, d.years ?? 1))
  const out = await prisma.$transaction(async (tx) => {
    const asset = await tx.webAsset.update({ where: { id: a.id }, data: { expiryDate: from, status: 'ACTIVE', lastReminderAt: null } })
    const label = `${a.type.toLowerCase().replace(/_/g, ' ')} renewal: ${a.name}`
    await activity(tx, a.organizationId, 'WEB_ASSET', a.id, 'UPDATED', `Renewed until ${from.toISOString().slice(0, 10)}`, req.user.id)
    let invoice: any = null
    if (d.createInvoice !== false && Number(a.billingAmount ?? 0) > 0) {
      invoice = await createInvoice(tx, a.organizationId, req.user.id, { customerId: a.customerId, items: [{ description: label[0].toUpperCase() + label.slice(1), quantity: Math.max(1, d.years ?? 1), unit: 'years', unitPrice: Number(a.billingAmount) }] })
    }
    await audit(tx, req, 'UPDATE', 'WEBSITES', 'WebAsset', a.id, { expiryDate: a.expiryDate }, { expiryDate: from })
    return { asset, invoice }
  })
  res.json(out)
})
webAssetsRouter.use('/', crud({
  model: 'webAsset', module: 'WEBSITES', label: 'Renewal', orderBy: { expiryDate: 'asc' }, search: ['name', 'provider', 'customer.name'], filters: ['type', 'customerId', 'status'],
  fields: { customerId: 'id', websiteId: 'id?', type: Object.values(E.WebAssetType), name: 's', provider: 's?', 'ownedBy?': Object.values(E.AssetOwner), purchaseDate: 'd?', expiryDate: 'd', renewalCost: 'n?', billingAmount: 'n?', 'autoRenew?': 'b', 'status?': Object.values(E.RenewalStatus) },
  include: { customer, website: { select: { id: true, name: true } } },
  decorate: (items) => { const t = today(); return items.map((i) => ({ ...i, daysLeft: daysBetween(i.expiryDate, t) })) },
}))

export const credentialsRouter = Router()
const credSpec = { label: 's', type: Object.values(E.CredentialType), customerId: 'id?', websiteId: 'id?', url: 's?', username: 's?', notes: 's?' } as const
const credFind = async (req: any) => {
  const c = await prisma.credential.findFirst({ where: { id: String(req.params.id), organizationId: req.user.organizationId } })
  if (!c) throw notFound('Credential')
  return c
}
credentialsRouter.get('/', authorize('WEBSITES', 'VIEW'), async (req, res) => {
  const items = await prisma.credential.findMany({
    where: { organizationId: req.user.organizationId },
    include: { customer, website: { select: { id: true, name: true } }, _count: { select: { accessLogs: true } }, accessLogs: { orderBy: { accessedAt: 'desc' }, take: 1, include: { user: U } } },
    orderBy: { label: 'asc' },
  })
  res.json({ items, total: items.length })
})
credentialsRouter.post('/', authorize('WEBSITES', 'CREATE'), async (req, res) => {
  const d = stripNulls(parse(shape({ ...credSpec, secret: 's' }), req.body))
  const { secret, ...cols } = d
  const c = await prisma.credential.create({ data: { ...cols, ...encrypt(secret), organizationId: req.user.organizationId, createdById: req.user.id } })
  await audit(prisma as any, req, 'CREATE', 'WEBSITES', 'Credential', c.id, null, { label: c.label })
  res.status(201).json(c)
})
credentialsRouter.patch('/:id', authorize('WEBSITES', 'EDIT'), async (req, res) => {
  const d = parse(shape({ ...credSpec, secret: 's?' }).partial(), req.body)
  const c = await credFind(req)
  const { secret, ...cols } = d
  const row = await prisma.credential.update({ where: { id: c.id }, data: { ...cols, ...(secret ? { ...encrypt(secret), lastRotatedAt: new Date() } : {}), updatedById: req.user.id } })
  await prisma.credentialAccessLog.create({ data: { credentialId: c.id, userId: req.user.id, action: 'UPDATE', ipAddress: req.ip ?? null } })
  res.json(row)
})
credentialsRouter.delete('/:id', authorize('WEBSITES', 'DELETE'), async (req, res) => {
  const c = await credFind(req)
  await prisma.credential.delete({ where: { id: c.id } })
  await audit(prisma as any, req, 'DELETE', 'WEBSITES', 'Credential', c.id, { label: c.label }, null)
  res.status(204).end()
})
credentialsRouter.post('/:id/reveal', authorize('WEBSITES', 'VIEW'), async (req, res) => {
  const c = await credFind(req)
  await prisma.credentialAccessLog.create({ data: { credentialId: c.id, userId: req.user.id, action: 'VIEW', ipAddress: req.ip ?? null } })
  await audit(prisma as any, req, 'SECRET_VIEW', 'WEBSITES', 'Credential', c.id, null, { label: c.label })
  res.json({ secret: decrypt(c) })
})

// ── Support tickets ──
export const ticketsRouter = Router()
const ticketCrud = crud({
  model: 'ticket', module: 'TICKETS', label: 'Ticket', by: true, number: ['ticketNumber', 'TICKET'], scope: SCOPES.TICKETS,
  fields: { customerId: 'id', contactId: 'id?', projectId: 'id?', websiteId: 'id?', subject: 's', description: 's', category: 's?', 'channel?': Object.values(E.TicketChannel), 'priority?': Object.values(E.Priority), 'status?': Object.values(E.TicketStatus), assigneeId: 'id?', resolutionNotes: 's?' },
  search: ['subject', 'ticketNumber', 'customer.name'], filters: ['status', 'priority', 'assigneeId', 'customerId'],
  include: { customer, assignee: U, website: { select: { id: true, name: true } } },
  afterCreate: async (row, req, tx) => {
    await activity(tx, row.organizationId, 'TICKET', row.id, 'CREATED', 'Ticket opened', req.user.id)
    if (row.assigneeId && row.assigneeId !== req.user.id) await notify(tx, row.organizationId, row.assigneeId, 'ticket.assigned', `Ticket ${row.ticketNumber} assigned to you`, '/tickets')
  },
  beforeUpdate: async (d, before, req, tx) => {
    if (d.status && d.status !== before.status) {
      if (d.status === 'RESOLVED') d.resolvedAt = new Date()
      if (d.status === 'CLOSED') d.closedAt = new Date()
      if (before.status === 'OPEN' && !before.firstResponseAt) d.firstResponseAt = new Date()
      await activity(tx, before.organizationId, 'TICKET', before.id, 'STATUS_CHANGED', `Status changed to ${String(d.status).toLowerCase().replace(/_/g, ' ')}`, req.user.id)
    }
    if (d.assigneeId && d.assigneeId !== before.assigneeId && d.assigneeId !== req.user.id) await notify(tx, before.organizationId, d.assigneeId, 'ticket.assigned', `Ticket ${before.ticketNumber} assigned to you`, '/tickets')
  },
})

// Conversation on a ticket: replies go to the customer by email, team notes stay inside.
const ticketWithPeople = { customer: { select: { id: true, name: true, email: true } }, contact: { select: { id: true, firstName: true, lastName: true, email: true } } }
const replyTo = (t: any) => t.contact?.email || t.customer?.email || null
ticketsRouter.get('/:id/conversation', authorize('TICKETS', 'VIEW'), async (req, res) => {
  const t = await findScoped(req, 'ticket', 'TICKETS', 'VIEW', { label: 'Ticket', include: ticketWithPeople })
  const items = await prisma.comment.findMany({ where: { organizationId: t.organizationId, entityType: 'TICKET', entityId: t.id, deletedAt: null }, include: { author: U, contact: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'asc' } })
  res.json({ items, replyTo: replyTo(t) })
})
ticketsRouter.post('/:id/reply', authorize('TICKETS', 'EDIT'), async (req, res) => {
  const d = parse(shape({ body: 's', 'internal?': 'b', 'status?': Object.values(E.TicketStatus) }), req.body)
  const t = await findScoped(req, 'ticket', 'TICKETS', 'EDIT', { label: 'Ticket', include: ticketWithPeople })
  const internal = d.internal ?? false
  const to = replyTo(t)
  if (!internal && !to) throw bad('This customer has no email address. Add one to the customer or contact first.')
  const status = d.status ?? (internal ? undefined : t.status === 'OPEN' ? 'IN_PROGRESS' : undefined)
  const comment = await prisma.$transaction(async (tx) => {
    const c = await tx.comment.create({ data: { organizationId: t.organizationId, entityType: 'TICKET', entityId: t.id, body: d.body, isInternal: internal, authorId: req.user.id }, include: { author: U } })
    const data: any = {}
    if (!internal && !t.firstResponseAt) data.firstResponseAt = new Date()
    if (status && status !== t.status) {
      data.status = status
      if (status === 'RESOLVED') data.resolvedAt = new Date()
      if (status === 'CLOSED') data.closedAt = new Date()
      await activity(tx, t.organizationId, 'TICKET', t.id, 'STATUS_CHANGED', `Status changed to ${status.toLowerCase().replace(/_/g, ' ')}`, req.user.id)
    }
    if (Object.keys(data).length) await tx.ticket.update({ where: { id: t.id }, data: { ...data, updatedById: req.user.id } })
    if (!internal) await activity(tx, t.organizationId, 'TICKET', t.id, 'EMAIL_SENT', 'Reply sent to the customer', req.user.id)
    return c
  })
  let mail: { sent: boolean; error: string | null } | null = null
  if (!internal && to) {
    const [org, me] = await Promise.all([prisma.organization.findUnique({ where: { id: t.organizationId }, select: { name: true } }), prisma.user.findUnique({ where: { id: req.user.id }, select: { firstName: true, lastName: true } })])
    const name = t.contact?.firstName || t.customer.name
    mail = await sendMail(t.organizationId, {
      to, subject: `Re: ${t.subject} [${t.ticketNumber}]`, sentById: req.user.id, customerId: t.customerId, entityType: 'TICKET', entityId: t.id,
      text: `Dear ${name},\n\n${d.body}\n\nRegards,\n${me ? fullName(me) : ''}\n${org?.name ?? ''}\n\nTicket ${t.ticketNumber}. Reply to this email if you need more help.`,
    })
  }
  res.status(201).json({ comment, mail })
})
ticketsRouter.use('/', ticketCrud)
