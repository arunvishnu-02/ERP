import { Router } from '../core/router'
import { crud } from '../core/crud'
import { bad } from '../core/http'
import { activity, SCOPES, U } from '../core/util'
import * as E from '../../generated/prisma/enums'

export const dealsRouter = Router()
const M = 'SALES'
const party = { customer: { select: { id: true, name: true } }, lead: { select: { id: true, firstName: true, lastName: true, companyName: true } } }

dealsRouter.use('/', crud({
  model: 'deal', module: M, label: 'Deal', soft: true, by: true, number: ['dealNumber', 'DEAL'], ownerField: 'ownerId', scope: SCOPES.SALES,
  fields: { title: 's', customerId: 'id?', leadId: 'id?', contactId: 'id?', stageId: 'id?', value: 'n?', expectedCloseDate: 'd?', ownerId: 'id?', lostReason: 's?' },
  search: ['title', 'dealNumber', 'customer.name', 'lead.companyName'], filters: ['status', 'stageId', 'ownerId', 'customerId'],
  include: { ...party, stage: true, owner: U },
  beforeCreate: async (d, req, tx) => {
    const pipeline = await tx.pipeline.findFirst({ where: { organizationId: req.user.organizationId }, orderBy: { isDefault: 'desc' }, include: { stages: { orderBy: { position: 'asc' } } } })
    if (!pipeline?.stages.length) throw bad('Set up a sales pipeline first')
    d.pipelineId = pipeline.id
    const stage = pipeline.stages.find((s) => s.id === d.stageId) ?? pipeline.stages[0]
    d.stageId = stage.id
    d.status = stage.isWon ? 'WON' : stage.isLost ? 'LOST' : 'OPEN'
    if (d.status !== 'OPEN') d.closedAt = new Date()
  },
  beforeUpdate: async (d, before, req, tx) => {
    if (d.stageId && d.stageId !== before.stageId) {
      const stage = await tx.pipelineStage.findFirst({ where: { id: d.stageId, pipelineId: before.pipelineId } })
      if (!stage) throw bad('Choose a stage')
      d.status = stage.isWon ? 'WON' : stage.isLost ? 'LOST' : 'OPEN'
      d.closedAt = d.status === 'OPEN' ? null : new Date()
      await activity(tx, before.organizationId, 'DEAL', before.id, 'STATUS_CHANGED', `Deal moved to ${stage.name}`, req.user.id)
    }
  },
}))

export const meetingsRouter = crud({
  model: 'meeting', module: M, label: 'Meeting', ownerField: 'organizerId', scope: (ids) => ({ organizerId: { in: ids } }),
  fields: { title: 's', leadId: 'id?', dealId: 'id?', customerId: 'id?', startsAt: 'd', endsAt: 'd', location: 's?', meetingUrl: 's?', agenda: 's?', outcome: 's?' },
  search: ['title'], include: { ...party, organizer: U }, orderBy: { startsAt: 'desc' }, dateField: 'startsAt',
})

export const callsRouter = crud({
  model: 'callLog', module: M, label: 'Call', ownerField: 'userId', scope: (ids) => ({ userId: { in: ids } }),
  fields: { leadId: 'id?', dealId: 'id?', customerId: 'id?', direction: Object.values(E.Direction), phone: 's', durationSeconds: 'i?', outcome: 's?', notes: 's?', calledAt: 'd?' },
  search: ['phone', 'outcome'], include: { ...party, user: U }, orderBy: { calledAt: 'desc' },
  afterCreate: async (row, req, tx) => {
    if (row.leadId) await activity(tx, row.organizationId, 'LEAD', row.leadId, 'CALL', row.outcome ? `Call: ${row.outcome}` : 'Call logged', req.user.id)
  },
})
