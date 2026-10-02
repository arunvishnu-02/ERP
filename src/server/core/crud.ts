import { Router, type Request } from './router'
import { prisma, type Tx } from '../db'
import { authorize, can, scopeIds, type Action } from './auth'
import { forbidden, isUuid, notFound, parse, shape, stripNulls, type Spec } from './http'
import { audit, dateOnly, nextNumber, scoped } from './util'

export interface CrudOptions {
  model: string
  module: string
  /** Module whose VIEW permission lets a user read the list, when different from `module`. */
  readModule?: string
  label?: string
  fields: Spec
  search?: string[]
  filters?: string[]
  dateField?: string
  include?: any
  includeOne?: any
  orderBy?: any
  soft?: boolean
  noOrg?: boolean
  by?: boolean
  scope?: (ids: string[]) => any
  number?: [field: string, type: string]
  ownerField?: string
  where?: (req: Request) => any
  beforeCreate?: (data: any, req: Request, tx: Tx) => Promise<void> | void
  afterCreate?: (row: any, req: Request, tx: Tx, data: any) => Promise<void> | void
  beforeUpdate?: (data: any, before: any, req: Request, tx: Tx) => Promise<void> | void
  afterUpdate?: (row: any, before: any, req: Request, tx: Tx) => Promise<void> | void
  beforeDelete?: (before: any, req: Request, tx: Tx) => Promise<void> | void
  decorate?: (items: any[], req: Request) => Promise<any[]> | any[]
}

const nest = (pathStr: string, leaf: any) => pathStr.split('.').reduceRight((acc, k) => ({ [k]: acc }), leaf)

/** Standard list, read, create, update and delete routes for one table, with permission and scope checks. */
export function crud(o: CrudOptions) {
  const r = Router({ mergeParams: true })
  const schema = shape(o.fields)
  const readModule = o.readModule ?? o.module
  const m = (c: any = prisma) => c[o.model]

  async function baseWhere(req: Request, module: string, action: Action) {
    const and: any[] = []
    const w: any = { AND: and }
    if (!o.noOrg) w.organizationId = req.user.organizationId
    if (o.soft) w.deletedAt = null
    const s = can(req.user, module, action)
    if (o.scope && s && s !== 'ALL') and.push(o.scope((await scopeIds(req.user, s))!))
    if (o.where) and.push(await o.where(req))
    return w
  }

  r.param('id', (_req, _res, next, id) => {
    if (!isUuid(id)) throw notFound(o.label)
    next()
  })

  r.get('/', authorize(readModule, 'VIEW'), async (req, res) => {
    const w = await baseWhere(req, readModule, 'VIEW')
    const q = String(req.query.q ?? '').trim()
    // every word must appear in at least one searchable field
    if (q && o.search?.length) for (const word of q.split(/\s+/).slice(0, 6)) w.AND.push({ OR: o.search.map((f) => nest(f, { contains: word })) })
    for (const f of o.filters ?? []) {
      const v = req.query[f]
      if (typeof v !== 'string' || v === '') continue
      w.AND.push({ [f]: v.includes(',') ? { in: v.split(',') } : v === 'true' ? true : v === 'false' ? false : v === 'null' ? null : v })
    }
    if (o.dateField) {
      const { from, to } = req.query
      if (typeof from === 'string' && from) w.AND.push({ [o.dateField]: { gte: dateOnly(from.slice(0, 10)) } })
      if (typeof to === 'string' && to) w.AND.push({ [o.dateField]: { lte: new Date(`${to.slice(0, 10)}T23:59:59.999Z`) } })
    }
    const all = req.query.all === '1'
    if (all && !can(req.user, o.module, 'EXPORT')) throw forbidden('You do not have permission to export this list')
    const take = all ? 5000 : Math.min(Number(req.query.limit) || 50, 500)
    const skip = Number(req.query.offset) || 0
    const [items, total] = await Promise.all([
      m().findMany({ where: w, include: o.include, orderBy: o.orderBy ?? { createdAt: 'desc' }, take, skip }),
      m().count({ where: w }),
    ])
    res.json({ items: o.decorate ? await o.decorate(items, req) : items, total })
  })

  r.get('/:id', authorize(readModule, 'VIEW'), async (req, res) => {
    const row = await m().findFirst({ where: { ...(await baseWhere(req, readModule, 'VIEW')), id: req.params.id }, include: o.includeOne ?? o.include })
    if (!row) throw notFound(o.label)
    res.json(o.decorate ? (await o.decorate([row], req))[0] : row)
  })

  r.post('/', authorize(o.module, 'CREATE'), async (req, res) => {
    const data = stripNulls(parse(schema, req.body))
    const row = await prisma.$transaction(async (tx) => {
      if (!o.noOrg) data.organizationId = req.user.organizationId
      if (o.by) data.createdById = req.user.id
      if (o.ownerField && !data[o.ownerField]) data[o.ownerField] = req.user.id
      if (o.number) data[o.number[0]] = await nextNumber(tx, req.user.organizationId, o.number[1])
      const extra = { ...data }
      await o.beforeCreate?.(data, req, tx)
      const created = await m(tx).create({ data, include: o.include })
      await audit(tx, req, 'CREATE', o.module, o.model, created.id, null, data)
      await o.afterCreate?.(created, req, tx, extra)
      return created
    })
    res.status(201).json(row)
  })

  r.patch('/:id', authorize(o.module, 'EDIT'), async (req, res) => {
    const data = parse(schema.partial(), req.body)
    const row = await prisma.$transaction(async (tx) => {
      const before = await m(tx).findFirst({ where: { ...(await baseWhere(req, o.module, 'EDIT')), id: req.params.id } })
      if (!before) throw notFound(o.label)
      if (o.by) data.updatedById = req.user.id
      await o.beforeUpdate?.(data, before, req, tx)
      const updated = await m(tx).update({ where: { id: before.id }, data, include: o.include })
      await audit(tx, req, 'UPDATE', o.module, o.model, before.id, before, data)
      await o.afterUpdate?.(updated, before, req, tx)
      return updated
    })
    res.json(row)
  })

  r.delete('/:id', authorize(o.module, 'DELETE'), async (req, res) => {
    await prisma.$transaction(async (tx) => {
      const before = await m(tx).findFirst({ where: { ...(await baseWhere(req, o.module, 'DELETE')), id: req.params.id } })
      if (!before) throw notFound(o.label)
      await o.beforeDelete?.(before, req, tx)
      if (o.soft) await m(tx).update({ where: { id: before.id }, data: { deletedAt: new Date() } })
      else await m(tx).delete({ where: { id: before.id } })
      await audit(tx, req, 'DELETE', o.module, o.model, before.id, before, null)
    })
    res.status(204).end()
  })

  return r
}

/** Loads one record the user is allowed to reach for the given action, or fails with 403/404. */
export async function findScoped(req: Request, model: string, module: string, action: 'VIEW' | 'EDIT' | 'DELETE' | 'APPROVE' | 'CREATE', o: { key?: string; soft?: boolean; include?: any; label?: string; id?: string } = {}) {
  const w = await scoped(req, module, action, o.key)
  if (!w) throw forbidden()
  const id = o.id ?? req.params.id
  const row = isUuid(id) ? await (prisma as any)[model].findFirst({ where: { id, organizationId: req.user.organizationId, ...(o.soft ? { deletedAt: null } : {}), AND: [w] }, include: o.include }) : null
  if (!row) throw notFound(o.label)
  return row
}

export const paging = (req: Request, max = 500) => ({ take: Math.min(Number(req.query.limit) || 50, max), skip: Number(req.query.offset) || 0 })
