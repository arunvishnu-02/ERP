import crypto from 'node:crypto'
import { authenticate, endOtherSessions, endSession, hashPassword, sha, startSession, verifyPassword } from '../core/auth'
import { bad, conflict, HttpError, parse, shape } from '../core/http'
import { rateLimit, Router } from '../core/router'
import { sendMail } from '../core/mail'
import { bootstrap } from '../core/seed'
import { STATES } from '../core/util'
import { prisma } from '../db'

export const authRouter = Router()
const limiter = rateLimit({ windowMs: 60_000, limit: 20, message: { message: 'Too many attempts. Wait a minute and try again.' } })
// password codes get their own counter, so sign-in attempts and code attempts do not use up each other's allowance
const codeLimiter = rateLimit({ windowMs: 60_000, limit: 10, message: { message: 'Too many attempts. Wait a minute and try again.' } })
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

// ── Forgot password: a 6-digit code by email, valid for 15 minutes and for 5 wrong tries ──
const CODE_MINUTES = 15
const CODE_TRIES = 5
const codeHash = (userId: string, code: string) => sha(`reset:${userId}:${code}`)

/** Always answers the same way, so nobody can use it to find out which emails have accounts. */
authRouter.post('/forgot', codeLimiter, async (req, res) => {
  const d = parse(shape({ email: 's' }), req.body)
  const user = await prisma.user.findFirst({ where: { email: d.email.toLowerCase().trim(), deletedAt: null, status: 'ACTIVE' }, include: { organization: { select: { name: true } } } })
  if (user) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
    await prisma.$transaction([
      prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
      prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: codeHash(user.id, code), expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000) } }),
    ])
    await sendMail(user.organizationId, {
      to: user.email, logText: 'Password code sent. The code itself is not kept.',
      subject: `${code} is your ${user.organization.name} password code`,
      text: `Hello ${user.firstName},\n\nUse this code to choose a new password: ${code}\n\nIt works for ${CODE_MINUTES} minutes. If you did not ask for it, ignore this email and your password stays the same.\n\n${user.organization.name}`,
    })
  }
  res.json({ ok: true, minutes: CODE_MINUTES })
})

authRouter.post('/reset', codeLimiter, async (req, res) => {
  const d = parse(shape({ email: 's', code: 's', password: 's' }), req.body)
  if (d.password.length < 8) throw bad('Use a password of at least 8 characters')
  const wrong = () => bad('This code is not right or has expired. Ask for a new one.')
  const user = await prisma.user.findFirst({ where: { email: d.email.toLowerCase().trim(), deletedAt: null, status: 'ACTIVE' } })
  if (!user) throw wrong()
  const token = await prisma.passwordResetToken.findFirst({ where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } })
  if (!token) throw wrong()
  if (token.tokenHash !== codeHash(user.id, d.code.replace(/\D/g, ''))) {
    await prisma.auditLog.create({ data: { organizationId: user.organizationId, userId: user.id, action: 'LOGIN_FAILED', entityType: 'PasswordReset', entityId: token.id, ipAddress: req.ip.slice(0, 100) } })
    const tries = await prisma.auditLog.count({ where: { organizationId: user.organizationId, entityType: 'PasswordReset', entityId: token.id } })
    if (tries >= CODE_TRIES) {
      await prisma.passwordResetToken.update({ where: { id: token.id }, data: { usedAt: new Date() } })
      throw bad('Too many wrong codes. Ask for a new one.')
    }
    throw wrong()
  }
  await prisma.$transaction([
    prisma.passwordResetToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(d.password), mustChangePassword: false } }),
    prisma.auditLog.create({ data: { organizationId: user.organizationId, userId: user.id, action: 'UPDATE', entityType: 'User', entityId: user.id, after: { passwordReset: 'by emailed code' }, ipAddress: req.ip.slice(0, 100) } }),
  ])
  await endOtherSessions(user.id)
  await startSession(req, res, user.id)
  res.json({ ok: true })
})
