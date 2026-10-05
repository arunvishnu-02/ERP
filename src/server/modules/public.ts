// Pages and forms that work without signing in: the customer's view of a quotation or invoice, and website lead capture.
import { Router } from '../core/router'
import { rateLimit } from '../core/router'
import { conflict, notFound, parse, shape, stripNulls } from '../core/http'
import { activity, notify } from '../core/util'
import { prisma } from '../db'
import { afterLead, prepLead } from './leads'

export const publicRouter = Router()
publicRouter.use(rateLimit({ windowMs: 60_000, limit: 60 }))

const orgSelect = { name: true, legalName: true, gstin: true, addressLine1: true, addressLine2: true, city: true, state: true, pincode: true, phone: true, email: true, settings: true }
const PUBLIC_SETTINGS = ['bankDetails', 'gstRegistered', 'website', 'tagline', 'upiId', 'signatory', 'logo']
const company = (o: any) => ({ ...o, settings: Object.fromEntries(PUBLIC_SETTINGS.map((k) => [k, o.settings?.[k] ?? null])) })
const token = (t: unknown) => (typeof t === 'string' && t.length >= 20 ? t : '-')

async function quotationByToken(t: unknown) {
  const q = await prisma.quotation.findUnique({
    where: { publicToken: token(t) },
    include: { items: { orderBy: { position: 'asc' } }, organization: { select: orgSelect }, customer: { select: { name: true, gstin: true, email: true, phone: true, billingState: true, billingAddressLine1: true, billingAddressLine2: true, billingCity: true, billingPincode: true } }, lead: { select: { firstName: true, lastName: true, companyName: true, state: true, city: true } } },
  })
  if (!q || q.deletedAt || !q.isLatest) throw notFound('Quotation')
  return q
}

publicRouter.get('/quotations/:token', async (req, res) => {
  let q = await quotationByToken(req.params.token)
  if (q.status === 'SENT') {
    q = { ...q, ...(await prisma.quotation.update({ where: { id: q.id }, data: { status: 'VIEWED', viewedAt: new Date() } })) }
    await activity(prisma as any, q.organizationId, 'QUOTATION', q.id, 'UPDATED', 'Opened by the customer')
  }
  const { publicToken, createdById, updatedById, preparedById, rejectionNote, organization, ...rest } = q
  res.json({ ...rest, organization: company(organization) })
})

publicRouter.post('/quotations/:token/:decision', async (req, res) => {
  const accepted = req.params.decision === 'accept'
  if (!accepted && req.params.decision !== 'decline') throw notFound('Page')
  const q = await quotationByToken(req.params.token)
  if (!['SENT', 'VIEWED'].includes(q.status)) throw conflict('This quotation is no longer open for a decision')
  await prisma.$transaction(async (tx) => {
    await tx.quotation.update({ where: { id: q.id }, data: accepted ? { status: 'ACCEPTED', acceptedAt: new Date() } : { status: 'DECLINED' } })
    await activity(tx, q.organizationId, 'QUOTATION', q.id, 'APPROVAL', accepted ? 'Accepted by the customer online' : 'Declined by the customer online')
    await notify(tx, q.organizationId, q.preparedById, 'quotation.decided', `Quotation ${q.quotationNumber} was ${accepted ? 'accepted' : 'declined'} by the customer`, '/quotations')
  })
  res.json({ status: accepted ? 'ACCEPTED' : 'DECLINED' })
})

publicRouter.get('/invoices/:token', async (req, res) => {
  const inv = await prisma.invoice.findUnique({
    where: { publicToken: token(req.params.token) },
    include: { items: { orderBy: { position: 'asc' } }, organization: { select: orgSelect }, customer: { select: { name: true, gstin: true, email: true, phone: true, billingState: true, billingAddressLine1: true, billingAddressLine2: true, billingCity: true, billingPincode: true } } },
  })
  if (!inv || inv.deletedAt || inv.status === 'DRAFT') throw notFound('Invoice')
  if (!inv.viewedAt) await prisma.invoice.update({ where: { id: inv.id }, data: { viewedAt: new Date() } })
  const { publicToken, createdById, updatedById, organization, ...rest } = inv
  res.json({ ...rest, organization: company(organization) })
})

/** Website enquiry form. POST JSON with ?key=<lead form key from Settings>. */
publicRouter.options('/leads', (_req, res) => {
  res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' }).status(204).end()
})
publicRouter.post('/leads', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  const key = token(req.query.key)
  // The key lives in the organization's settings JSON. There are only a handful of organizations, so compare in code.
  const org = key ? (await prisma.organization.findMany()).find((o) => (o.settings as any)?.leadFormKey === key) : undefined
  if (!org) throw notFound('Form')
  const d = parse(shape({ name: 's', company: 's?', email: 's?', phone: 's?', city: 's?', state: 's?', message: 's?' }), req.body)
  const [firstName, ...rest] = d.name.split(' ')
  await prisma.$transaction(async (tx) => {
    const source = await tx.leadSource.findFirst({ where: { organizationId: org.id, name: 'Website form' } })
    const data: any = stripNulls({ organizationId: org.id, firstName, lastName: rest.join(' ') || null, companyName: d.company, email: d.email, phone: d.phone, city: d.city, state: d.state, requirement: d.message, sourceId: source?.id ?? null })
    const auto = await prepLead(tx, org.id, data, null)
    const lead = await tx.lead.create({ data })
    await afterLead(tx, lead, null, auto, 'from the website form')
    if (!lead.ownerId) {
      const admins = await tx.user.findMany({ where: { organizationId: org.id, status: 'ACTIVE', roles: { some: { role: { key: 'SUPER_ADMIN' } } } }, select: { id: true } })
      for (const a of admins) await notify(tx, org.id, a.id, 'lead.unassigned', `New website lead without an owner: ${d.name}`, '/leads')
    }
  })
  res.status(201).json({ ok: true })
})
