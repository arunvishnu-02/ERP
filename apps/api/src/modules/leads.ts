import { Router } from 'express'
import { authorize, can, fullName, scopeIds } from '../core/auth.js'
import { crud, findScoped } from '../core/crud.js'
import { bad, conflict, forbidden, notFound, parse, shape, stripNulls } from '../core/http.js'
import { activity, audit, nextNumber, notify, SCOPES, stateCode, today, U, EXPORT_CODE } from '../core/util.js'
import { prisma, type Tx } from '../db.js'
import * as E from '../generated/prisma/enums.js'

/** Picks the next person in the lead rotation, when that automation is switched on. */
async function assignOwner(tx: Tx, organizationId: string) {
  const rule = await tx.automationRule.findFirst({ where: { organizationId, trigger: 'LEAD_CREATED', isActive: true } })
  const rotation = await tx.leadAssignmentRule.findFirst({ where: { organizationId, isActive: true }, orderBy: { priority: 'desc' } })
  if (!rule || !rotation?.assigneeIds.length) return null
  const active = await tx.user.findMany({ where: { id: { in: rotation.assigneeIds }, status: 'ACTIVE', deletedAt: null }, select: { id: true } })
  const ids = rotation.assigneeIds.filter((id) => active.some((a) => a.id === id))
  if (!ids.length) return null
  const idx = rotation.lastAssignedIndex % ids.length
  await tx.leadAssignmentRule.update({ where: { id: rotation.id }, data: { lastAssignedIndex: idx + 1 } })
  await tx.automationRule.update({ where: { id: rule.id }, data: { runCount: { increment: 1 }, lastRunAt: new Date() } })
  return ids[idx]
}

/** Fills in the stage, owner and number for a new lead. Returns true when the owner was chosen automatically. */
export async function prepLead(tx: Tx, organizationId: string, data: any, fallbackOwner: string | null) {
  if (!data.stageId) {
    const stage = (await tx.leadStage.findFirst({ where: { organizationId, isDefault: true } })) ?? (await tx.leadStage.findFirstOrThrow({ where: { organizationId }, orderBy: { position: 'asc' } }))
    data.stageId = stage.id
  }
  let auto = false
  if (!data.ownerId) {
    const picked = await assignOwner(tx, organizationId)
    auto = !!picked
    data.ownerId = picked ?? fallbackOwner
  }
  data.leadNumber = await nextNumber(tx, organizationId, 'LEAD')
  return auto
}

export async function afterLead(tx: Tx, lead: any, actorId: string | null, auto: boolean, origin: string) {
  if (lead.nextFollowUpAt && lead.ownerId) {
    await tx.followUp.create({ data: { organizationId: lead.organizationId, leadId: lead.id, type: 'CALL', dueAt: lead.nextFollowUpAt, assignedToId: lead.ownerId, createdById: actorId } })
  }
  await activity(tx, lead.organizationId, 'LEAD', lead.id, 'CREATED', `Lead added ${origin}${auto ? ' and assigned automatically' : ''}`, actorId)
  if (lead.ownerId && lead.ownerId !== actorId) await notify(tx, lead.organizationId, lead.ownerId, 'lead.assigned', `New lead assigned to you: ${fullName(lead)}`, '/leads')
}

/** Turns a lead into a customer with a primary contact. Used directly and when a quotation becomes a project. */
export async function convertLead(tx: Tx, lead: any, actorId: string) {
  if (lead.customerId) return tx.customer.findUniqueOrThrow({ where: { id: lead.customerId } })
  const organizationId = lead.organizationId
  const code = stateCode(lead.state)
  const customer = await tx.customer.create({
    data: {
      organizationId, customerNumber: await nextNumber(tx, organizationId, 'CUSTOMER'), type: lead.companyName ? 'COMPANY' : 'INDIVIDUAL', name: lead.companyName || fullName(lead),
      email: lead.email, phone: lead.phone, website: lead.website, billingCity: lead.city, billingState: lead.state, billingStateCode: code, isExport: code === EXPORT_CODE,
      accountManagerId: lead.ownerId, createdById: actorId,
    },
  })
  await tx.contact.create({ data: { organizationId, customerId: customer.id, firstName: lead.firstName, lastName: lead.lastName, email: lead.email, phone: lead.phone, whatsappNumber: lead.whatsappNumber, isPrimary: true } })
  const won = await tx.leadStage.findFirst({ where: { organizationId, isWon: true } })
  await tx.lead.update({ where: { id: lead.id }, data: { status: 'CONVERTED', convertedAt: new Date(), customerId: customer.id, nextFollowUpAt: null, ...(won ? { stageId: won.id } : {}) } })
  await tx.followUp.updateMany({ where: { leadId: lead.id, status: 'PENDING' }, data: { status: 'CANCELLED' } })
  await tx.deal.updateMany({ where: { leadId: lead.id }, data: { customerId: customer.id } })
  await tx.quotation.updateMany({ where: { leadId: lead.id, customerId: null }, data: { customerId: customer.id } })
  await activity(tx, organizationId, 'LEAD', lead.id, 'STATUS_CHANGED', `Converted to customer ${customer.customerNumber}`, actorId)
  await activity(tx, organizationId, 'CUSTOMER', customer.id, 'CREATED', `Customer created from lead ${lead.leadNumber}`, actorId)
  return customer
}

export const leadsRouter = Router()
const M = 'LEADS'
const leadSpec = { firstName: 's', lastName: 's?', companyName: 's?', email: 's?', phone: 's?', whatsappNumber: 's?', website: 's?', city: 's?', state: 's?', sourceId: 'id?', stageId: 'id?', requirement: 's?', estimatedValue: 'n?', ownerId: 'id?', nextFollowUpAt: 'd?', lostReason: 's?' } as const

leadsRouter.post('/import', authorize(M, 'IMPORT'), async (req, res) => {
  const rows: any[] = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 2000) : []
  if (!rows.length) throw bad('The file has no rows to import')
  const organizationId = req.user.organizationId
  const sources = await prisma.leadSource.findMany({ where: { organizationId } })
  let created = 0
  const errors: { row: number; message: string }[] = []
  for (const [i, raw] of rows.entries()) {
    const name = String(raw.name ?? raw.firstName ?? '').trim()
    if (!name) { errors.push({ row: i + 2, message: 'Name is missing' }); continue }
    const [firstName, ...rest] = name.split(' ')
    const source = sources.find((s) => s.name.toLowerCase() === String(raw.source ?? '').trim().toLowerCase())
    try {
      await prisma.$transaction(async (tx) => {
        const data: any = stripNulls({
          organizationId, firstName, lastName: rest.join(' ') || String(raw.lastName ?? '') || null, companyName: raw.company || null, email: raw.email || null,
          phone: raw.phone ? String(raw.phone) : null, city: raw.city || null, state: raw.state || null, requirement: raw.requirement || null,
          estimatedValue: Number(raw.value) || null, sourceId: source?.id ?? null, createdById: req.user.id,
        })
        const auto = await prepLead(tx, organizationId, data, req.user.id)
        await afterLead(tx, await tx.lead.create({ data }), req.user.id, auto, 'by import')
      })
      created++
    } catch (e: any) {
      errors.push({ row: i + 2, message: String(e?.message ?? 'Could not be saved').slice(0, 200) })
    }
  }
  await audit(prisma as unknown as Tx, req, 'IMPORT', M, 'Lead', null, null, { created, failed: errors.length })
  res.json({ created, failed: errors.length, errors: errors.slice(0, 50) })
})

leadsRouter.post('/:id/log', authorize(M, 'EDIT'), async (req, res) => {
  const d = parse(shape({ type: ['CALL', 'MEETING', 'NOTE_ADDED', 'WHATSAPP_SENT', 'EMAIL_SENT'], note: 's', nextFollowUpAt: 'd?' }), req.body)
  const lead = await findScoped(req, 'lead', M, 'EDIT', { soft: true, label: 'Lead' })
  const organizationId = lead.organizationId
  await prisma.$transaction(async (tx) => {
    await activity(tx, organizationId, 'LEAD', lead.id, d.type, d.note, req.user.id)
    await tx.followUp.updateMany({ where: { leadId: lead.id, status: 'PENDING' }, data: { status: 'DONE', completedAt: new Date(), outcome: d.note.slice(0, 500) } })
    const data: any = { lastContactedAt: new Date(), nextFollowUpAt: d.nextFollowUpAt ?? null }
    if (d.nextFollowUpAt && lead.ownerId) await tx.followUp.create({ data: { organizationId, leadId: lead.id, type: 'CALL', dueAt: d.nextFollowUpAt, assignedToId: lead.ownerId, createdById: req.user.id } })
    const stage = await tx.leadStage.findUnique({ where: { id: lead.stageId } })
    if (stage?.isDefault) {
      const next = await tx.leadStage.findFirst({ where: { organizationId, position: { gt: stage.position }, isWon: false, isLost: false }, orderBy: { position: 'asc' } })
      if (next) data.stageId = next.id
    }
    await tx.lead.update({ where: { id: lead.id }, data })
  })
  res.status(204).end()
})

leadsRouter.post('/:id/convert', authorize(M, 'EDIT'), async (req, res) => {
  const lead = await findScoped(req, 'lead', M, 'EDIT', { soft: true, label: 'Lead' })
  if (lead.status === 'CONVERTED') throw conflict('This lead is already a customer')
  const customer = await prisma.$transaction(async (tx) => {
    const c = await convertLead(tx, lead, req.user.id)
    await audit(tx, req, 'UPDATE', M, 'Lead', lead.id, null, { convertedTo: c.id })
    return c
  })
  res.status(201).json(customer)
})

leadsRouter.use('/', crud({
  model: 'lead', module: M, label: 'Lead', soft: true, by: true, fields: leadSpec, scope: SCOPES.LEADS,
  search: ['firstName', 'lastName', 'companyName', 'phone', 'email', 'leadNumber'], filters: ['stageId', 'status', 'ownerId', 'sourceId'],
  include: { source: true, stage: true, owner: U },
  includeOne: {
    source: true, stage: true, owner: U, customer: { select: { id: true, name: true } },
    followUps: { orderBy: { dueAt: 'desc' }, include: { assignedTo: U } },
    quotations: { where: { isLatest: true, deletedAt: null }, select: { id: true, quotationNumber: true, revision: true, status: true, totalAmount: true } },
  },
  beforeCreate: async (data, req, tx) => { (req as any).autoAssigned = await prepLead(tx, req.user.organizationId, data, req.user.id) },
  afterCreate: (row, req, tx) => afterLead(tx, row, req.user.id, (req as any).autoAssigned, row.source ? `from ${row.source.name}` : 'by hand'),
  beforeUpdate: async (data, before, req, tx) => {
    if (data.stageId && data.stageId !== before.stageId) {
      if (before.status === 'CONVERTED') throw conflict('This lead is already a customer')
      const stage = await tx.leadStage.findFirst({ where: { id: data.stageId, organizationId: before.organizationId } })
      if (!stage) throw bad('Choose a stage')
      if (stage.isWon) throw bad('To mark a lead as won, convert it to a customer')
      data.status = stage.isLost ? 'LOST' : 'OPEN'
      if (stage.isLost) { data.nextFollowUpAt = null; await tx.followUp.updateMany({ where: { leadId: before.id, status: 'PENDING' }, data: { status: 'CANCELLED' } }) }
      await activity(tx, before.organizationId, 'LEAD', before.id, 'STATUS_CHANGED', `Stage changed to ${stage.name}`, req.user.id)
    }
    if (data.ownerId && data.ownerId !== before.ownerId) {
      await activity(tx, before.organizationId, 'LEAD', before.id, 'ASSIGNED', 'Lead reassigned', req.user.id)
      await tx.followUp.updateMany({ where: { leadId: before.id, status: 'PENDING' }, data: { assignedToId: data.ownerId } })
      if (data.ownerId !== req.user.id) await notify(tx, before.organizationId, data.ownerId, 'lead.assigned', `Lead assigned to you: ${fullName(before)}`, '/leads')
    }
  },
}))

export const followUpsRouter = Router()
followUpsRouter.get('/', async (req, res) => {
  const scope = can(req.user, 'SALES', 'VIEW') ?? can(req.user, M, 'VIEW')
  if (!scope) throw forbidden()
  const ids = await scopeIds(req.user, scope)
  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : 'PENDING'
  const items = await prisma.followUp.findMany({
    where: { organizationId: req.user.organizationId, ...(status === 'ALL' ? {} : { status: status as any }), ...(ids ? { assignedToId: { in: ids } } : {}) },
    include: { lead: { select: { id: true, firstName: true, lastName: true, companyName: true, phone: true } }, deal: { select: { id: true, title: true } }, customer: { select: { id: true, name: true } }, assignedTo: U },
    orderBy: { dueAt: 'asc' }, take: 300,
  })
  res.json({ items, total: items.length, today: today() })
})
followUpsRouter.post('/', async (req, res) => {
  if (!can(req.user, 'SALES', 'CREATE') && !can(req.user, M, 'EDIT')) throw forbidden()
  const d = stripNulls(parse(shape({ leadId: 'id?', dealId: 'id?', customerId: 'id?', type: Object.values(E.FollowUpType), subject: 's?', dueAt: 'd', assignedToId: 'id?' }), req.body))
  if (!d.leadId && !d.dealId && !d.customerId) throw bad('Choose who the follow-up is with')
  const f = await prisma.followUp.create({ data: { ...d, organizationId: req.user.organizationId, assignedToId: d.assignedToId ?? req.user.id, createdById: req.user.id } })
  if (d.leadId) await prisma.lead.updateMany({ where: { id: d.leadId, organizationId: req.user.organizationId }, data: { nextFollowUpAt: d.dueAt } })
  res.status(201).json(f)
})
followUpsRouter.post('/:id/complete', async (req, res) => {
  const d = parse(shape({ outcome: 's?' }), req.body)
  const f = await prisma.followUp.findFirst({ where: { id: String(req.params.id), organizationId: req.user.organizationId } })
  if (!f) throw notFound('Follow-up')
  if (f.assignedToId !== req.user.id && !can(req.user, 'SALES', 'EDIT') && !can(req.user, M, 'EDIT')) throw forbidden()
  await prisma.$transaction(async (tx) => {
    await tx.followUp.update({ where: { id: f.id }, data: { status: 'DONE', completedAt: new Date(), outcome: d.outcome ?? null } })
    if (f.leadId) {
      await activity(tx, f.organizationId, 'LEAD', f.leadId, 'FOLLOW_UP_DONE', d.outcome ? `Follow-up done: ${d.outcome}` : 'Follow-up done', req.user.id)
      await tx.lead.update({ where: { id: f.leadId }, data: { lastContactedAt: new Date(), nextFollowUpAt: null } })
    }
  })
  res.status(204).end()
})
