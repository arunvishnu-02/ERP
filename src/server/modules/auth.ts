import { authenticate, endOtherSessions, endSession, hashPassword, startSession, verifyPassword } from '../core/auth'
import { bad, conflict, HttpError, parse, shape } from '../core/http'
import { rateLimit, Router } from '../core/router'
import { bootstrap } from '../core/seed'
import { STATES } from '../core/util'
import { prisma } from '../db'

export const authRouter = Router()
const limiter = rateLimit({ windowMs: 60_000, limit: 20, message: { message: 'Too many attempts. Wait a minute and try again.' } })
const unauthorized = (m = 'Sign in to continue') => new HttpError(401, m)

authRouter.get('/status', async (_req, res) => {
  res.json({ needsSetup: (await prisma.organization.count()) === 0, states: STATES })
})

authRouter.post('/setup', limiter, async (req, res) => {
  if (await prisma.organization.count()) throw conflict('Setup is already complete. Sign in instead.')
  const d = parse(shape({ companyName: 's', stateCode: 's', gstin: 's?', firstName: 's', lastName: 's?', email: 's', password: 's' }), req.body)
  if (d.password.length < 8) throw bad('Use a password of at least 8 characters')
  if (!STATES.some((s) => s.code === d.stateCode)) throw bad('Choose the state the company is registered in')
  const passwordHash = await hashPassword(d.password)
  const user = await prisma.$transaction((tx) => bootstrap(tx, { ...d, passwordHash }), { timeout: 60_000, maxWait: 15_000 })
  await startSession(req, res, user.id)
  res.status(201).json({ ok: true })
})

authRouter.post('/login', limiter, async (req, res) => {
  const d = parse(shape({ email: 's', password: 's' }), req.body)
  const user = await prisma.user.findFirst({ where: { email: d.email.toLowerCase(), deletedAt: null } })
  const ok = !!user && user.status === 'ACTIVE' && (await verifyPassword(user.passwordHash, d.password))
  if (user) {
    await prisma.auditLog.create({ data: { organizationId: user.organizationId, userId: user.id, action: ok ? 'LOGIN' : 'LOGIN_FAILED', entityType: 'User', entityId: user.id, ipAddress: req.ip.slice(0, 100), userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300) } })
  }
  if (!ok || !user) throw unauthorized('Email or password is incorrect')
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await startSession(req, res, user.id)
  res.json({ ok: true })
})

authRouter.post('/logout', async (req, res) => {
  await endSession(req, res)
  res.status(204).end()
})

authRouter.get('/me', authenticate, (req, res) => {
  res.json(req.user)
})

authRouter.post('/change-password', authenticate, async (req, res) => {
  const d = parse(shape({ current: 's', next: 's' }), req.body)
  if (d.next.length < 8) throw bad('Use a password of at least 8 characters')
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user.id } })
  if (!(await verifyPassword(user.passwordHash, d.current))) throw bad('The current password is not correct')
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(d.next), mustChangePassword: false } })
  await endOtherSessions(user.id, req.sessionId)
  res.status(204).end()
})
