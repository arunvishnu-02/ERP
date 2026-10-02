import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { authenticate, clearRefreshCookie, hashPassword, issueTokens, readRefreshCookie, sha, verifyPassword } from '../core/auth.js'
import { bad, conflict, HttpError, parse, shape } from '../core/http.js'
import { bootstrap } from '../core/seed.js'
import { STATES } from '../core/util.js'
import { prisma } from '../db.js'

export const authRouter = Router()
const limiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many attempts. Wait a minute and try again.' } })
const unauthorized = (m = 'Sign in to continue') => new HttpError(401, m)

authRouter.get('/status', async (_req, res) => {
  res.json({ needsSetup: (await prisma.organization.count()) === 0, states: STATES })
})

authRouter.post('/setup', limiter, async (req, res) => {
  if (await prisma.organization.count()) throw conflict('Setup is already complete. Sign in instead.')
  const d = parse(shape({ companyName: 's', stateCode: 's', gstin: 's?', firstName: 's', lastName: 's?', email: 's', password: 's' }), req.body)
  if (d.password.length < 8) throw bad('Use a password of at least 8 characters')
  if (!STATES.some((s) => s.code === d.stateCode)) throw bad('Choose the state the company is registered in')
  const user = await prisma.$transaction((tx) => bootstrap(tx, d), { timeout: 60_000 })
  res.status(201).json({ accessToken: await issueTokens(req, res, user) })
})

authRouter.post('/login', limiter, async (req, res) => {
  const d = parse(shape({ email: 's', password: 's' }), req.body)
  const user = await prisma.user.findFirst({ where: { email: d.email.toLowerCase(), deletedAt: null } })
  const ok = !!user && user.status === 'ACTIVE' && (await verifyPassword(user.passwordHash, d.password))
  if (user) {
    await prisma.auditLog.create({ data: { organizationId: user.organizationId, userId: user.id, action: ok ? 'LOGIN' : 'LOGIN_FAILED', entityType: 'User', entityId: user.id, ipAddress: req.ip ?? null, userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300) } })
  }
  if (!ok || !user) throw unauthorized('Email or password is incorrect')
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  res.json({ accessToken: await issueTokens(req, res, user) })
})

authRouter.post('/refresh', async (req, res) => {
  const raw = readRefreshCookie(req)
  if (!raw) throw unauthorized()
  const t = await prisma.refreshToken.findUnique({ where: { tokenHash: sha(raw) }, include: { user: true } })
  if (!t || t.expiresAt < new Date() || t.user.status !== 'ACTIVE' || t.user.deletedAt) throw unauthorized()
  if (t.revokedAt) {
    // A token used again long after it was replaced means it was copied: sign out every session in the family.
    if (Date.now() - t.revokedAt.getTime() > 30_000) {
      await prisma.refreshToken.updateMany({ where: { family: t.family, revokedAt: null }, data: { revokedAt: new Date() } })
      throw unauthorized()
    }
  } else {
    await prisma.refreshToken.update({ where: { id: t.id }, data: { revokedAt: new Date() } })
  }
  res.json({ accessToken: await issueTokens(req, res, t.user, t.family) })
})

authRouter.post('/logout', async (req, res) => {
  const raw = readRefreshCookie(req)
  const t = raw ? await prisma.refreshToken.findUnique({ where: { tokenHash: sha(raw) } }) : null
  if (t) await prisma.refreshToken.deleteMany({ where: { family: t.family } })
  clearRefreshCookie(res)
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
  const raw = readRefreshCookie(req)
  await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null, ...(raw ? { NOT: { tokenHash: sha(raw) } } : {}) }, data: { revokedAt: new Date() } })
  res.status(204).end()
})
