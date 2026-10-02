import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { Router, type Request } from 'express'
import multer from 'multer'
import { can } from '../core/auth.js'
import { bad, forbidden, isUuid, notFound, parse, shape } from '../core/http.js'
import { activity, notify, U } from '../core/util.js'
import { prisma, type Tx } from '../db.js'
import { env } from '../env.js'

/** Which module's "view" permission is needed to read the notes, comments, files and timeline of each record type. */
export const ENTITY_MODULE: Record<string, string> = {
  LEAD: 'LEADS', CUSTOMER: 'CUSTOMERS', CONTACT: 'CUSTOMERS', DEAL: 'SALES', QUOTATION: 'QUOTATIONS', INVOICE: 'INVOICES', CREDIT_NOTE: 'INVOICES', PAYMENT: 'PAYMENTS',
  PROJECT: 'PROJECTS', MILESTONE: 'PROJECTS', TASK: 'TASKS', CAMPAIGN: 'MARKETING', CONTENT_ITEM: 'MARKETING', WEBSITE: 'WEBSITES', WEB_ASSET: 'WEBSITES', TICKET: 'TICKETS',
  DOCUMENT: 'DOCUMENTS', EMPLOYEE: 'HR', LEAVE_REQUEST: 'HR', ASSET: 'ASSETS', EXPENSE: 'FINANCE',
}
function entity(req: Request) {
  const entityType = String(req.query.entityType ?? req.body?.entityType ?? '')
  const entityId = String(req.query.entityId ?? req.body?.entityId ?? '')
  const module = ENTITY_MODULE[entityType]
  if (!module || !isUuid(entityId)) throw bad('Unknown record')
  if (!can(req.user, module, 'VIEW')) throw forbidden()
  return { organizationId: req.user.organizationId, entityType: entityType as any, entityId }
}

export const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(env.uploadDir, (req as Request).user.organizationId)
      fs.mkdirSync(dir, { recursive: true })
      cb(null, dir)
    },
    filename: (_req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).slice(0, 12).replace(/[^.\w]/g, '')),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
})

export async function saveFile(tx: Tx, req: Request, file: Express.Multer.File) {
  return tx.file.create({
    data: { organizationId: req.user.organizationId, bucket: 'local', key: path.join(req.user.organizationId, file.filename), fileName: file.originalname.slice(0, 255), mimeType: file.mimetype, sizeBytes: BigInt(file.size), uploadedById: req.user.id },
  })
}

export const sharedRouter = Router()

sharedRouter.get('/notes', async (req, res) => {
  res.json({ items: await prisma.note.findMany({ where: entity(req), include: { author: U }, orderBy: { createdAt: 'desc' } }) })
})
sharedRouter.post('/notes', async (req, res) => {
  const e = entity(req)
  const d = parse(shape({ body: 's' }), req.body)
  const note = await prisma.$transaction(async (tx) => {
    const n = await tx.note.create({ data: { ...e, body: d.body, authorId: req.user.id }, include: { author: U } })
    await activity(tx, e.organizationId, e.entityType, e.entityId, 'NOTE_ADDED', d.body, req.user.id)
    return n
  })
  res.status(201).json(note)
})
sharedRouter.delete('/notes/:id', async (req, res) => {
  const n = await prisma.note.findFirst({ where: { id: String(req.params.id), organizationId: req.user.organizationId } })
  if (!n) throw notFound('Note')
  if (n.authorId !== req.user.id && !can(req.user, 'SETTINGS', 'EDIT')) throw forbidden('Only the author can delete this note')
  await prisma.note.delete({ where: { id: n.id } })
  res.status(204).end()
})

sharedRouter.get('/comments', async (req, res) => {
  res.json({ items: await prisma.comment.findMany({ where: { ...entity(req), deletedAt: null }, include: { author: U }, orderBy: { createdAt: 'asc' } }) })
})
sharedRouter.post('/comments', async (req, res) => {
  const e = entity(req)
  const d = parse(shape({ body: 's' }), req.body)
  const c = await prisma.$transaction(async (tx) => {
    const row = await tx.comment.create({ data: { ...e, body: d.body, authorId: req.user.id, mentions: [] }, include: { author: U } })
    if (e.entityType === 'TASK') {
      const t = await tx.task.findUnique({ where: { id: e.entityId } })
      for (const uid of new Set([t?.assigneeId, t?.reporterId])) if (uid && uid !== req.user.id) await notify(tx, e.organizationId, uid, 'task.comment', `${req.user.name} commented on "${t!.title}"`, '/tasks')
    }
    if (e.entityType === 'TICKET') {
      const t = await tx.ticket.findUnique({ where: { id: e.entityId } })
      if (t?.assigneeId && t.assigneeId !== req.user.id) await notify(tx, e.organizationId, t.assigneeId, 'ticket.comment', `${req.user.name} commented on ticket ${t.ticketNumber}`, '/tickets')
    }
    return row
  })
  res.status(201).json(c)
})

sharedRouter.get('/activities', async (req, res) => {
  res.json({ items: await prisma.activity.findMany({ where: entity(req), include: { actor: U }, orderBy: { occurredAt: 'desc' }, take: 200 }) })
})

sharedRouter.post('/files', upload.single('file'), async (req, res) => {
  if (!req.file) throw bad('Choose a file to upload')
  res.status(201).json(await saveFile(prisma as unknown as Tx, req, req.file))
})
sharedRouter.get('/files/:id/download', async (req, res) => {
  const f = isUuid(req.params.id) ? await prisma.file.findFirst({ where: { id: String(req.params.id), organizationId: req.user.organizationId } }) : null
  const full = f ? path.resolve(env.uploadDir, f.key) : ''
  if (!f || !full.startsWith(path.resolve(env.uploadDir)) || !fs.existsSync(full)) throw notFound('File')
  res.setHeader('Content-Type', f.mimeType)
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.fileName)}`)
  fs.createReadStream(full).pipe(res)
})

sharedRouter.get('/attachments', async (req, res) => {
  res.json({ items: await prisma.attachment.findMany({ where: entity(req), include: { file: true }, orderBy: { createdAt: 'desc' } }) })
})
sharedRouter.post('/attachments', upload.single('file'), async (req, res) => {
  const e = entity(req)
  if (!req.file) throw bad('Choose a file to upload')
  const a = await prisma.$transaction(async (tx) => {
    const file = await saveFile(tx, req, req.file!)
    await activity(tx, e.organizationId, e.entityType, e.entityId, 'FILE_ADDED', `File added: ${file.fileName}`, req.user.id)
    return tx.attachment.create({ data: { ...e, fileId: file.id, createdById: req.user.id }, include: { file: true } })
  })
  res.status(201).json(a)
})
sharedRouter.delete('/attachments/:id', async (req, res) => {
  const a = await prisma.attachment.findFirst({ where: { id: String(req.params.id), organizationId: req.user.organizationId } })
  if (!a) throw notFound('Attachment')
  if (a.createdById !== req.user.id && !can(req.user, ENTITY_MODULE[a.entityType], 'DELETE')) throw forbidden()
  await prisma.attachment.delete({ where: { id: a.id } })
  res.status(204).end()
})

sharedRouter.get('/notifications', async (req, res) => {
  const where = { userId: req.user.id }
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.notification.count({ where: { ...where, readAt: null } }),
  ])
  res.json({ items, unread })
})
sharedRouter.post('/notifications/read', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(isUuid) : null
  await prisma.notification.updateMany({ where: { userId: req.user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } })
  res.status(204).end()
})
