import crypto from 'node:crypto'
import { prisma } from '../db'
import { env } from '../env'
import { forbidden, HttpError } from './http'
import type { NextFunction, Request, Response } from './router'

export type Scope = 'OWN' | 'TEAM' | 'DEPARTMENT' | 'ALL'
export type Action = 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE' | 'APPROVE' | 'EXPORT' | 'IMPORT'
const RANK: Record<Scope, number> = { OWN: 0, TEAM: 1, DEPARTMENT: 2, ALL: 3 }

export interface AuthUser {
  id: string
  organizationId: string
  name: string
  email: string
  departmentId: string | null
  branchId: string | null
  employeeId: string | null
  mustChangePassword: boolean
  roles: { id: string; key: string; name: string }[]
  perms: Record<string, Record<string, Scope>>
}

// ── Passwords: scrypt from Node's own crypto module, with a random salt per password ──
const SCRYPT = { N: 2 ** 15, r: 8, p: 3 }
const scrypt = (password: string, salt: Buffer, o: { N: number; r: number; p: number }) =>
  new Promise<Buffer>((resolve, reject) => crypto.scrypt(password.normalize('NFKC'), salt, 64, { ...o, maxmem: 256 * 1024 * 1024 }, (e, key) => (e ? reject(e) : resolve(key))))

/** Stored as scrypt$N$r$p$salt$hash, so the cost can be raised later without breaking old passwords. */
export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16)
  const key = await scrypt(password, salt, SCRYPT)
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`
}
export async function verifyPassword(stored: string, password: string) {
  const [kind, N, r, p, salt, hash] = stored.split('$')
  if (kind !== 'scrypt' || !salt || !hash) return false
  try {
    const expected = Buffer.from(hash, 'base64')
    const actual = await scrypt(password, Buffer.from(salt, 'base64'), { N: Number(N), r: Number(r), p: Number(p) })
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}
export const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex')
export const fullName = (u: { firstName: string; lastName?: string | null }) => [u.firstName, u.lastName].filter(Boolean).join(' ')

export async function loadUser(id: string): Promise<AuthUser | null> {
  const u = await prisma.user.findFirst({
    where: { id, status: 'ACTIVE', deletedAt: null },
    include: {
      employee: { select: { id: true } },
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
    },
  })
  if (!u) return null
  const perms: AuthUser['perms'] = {}
  for (const ur of u.roles) {
    for (const rp of ur.role.permissions) {
      const m = (perms[rp.permission.module] ??= {})
      const cur = m[rp.permission.action]
      if (!cur || RANK[rp.scope as Scope] > RANK[cur]) m[rp.permission.action] = rp.scope as Scope
    }
  }
  return {
    id: u.id,
    organizationId: u.organizationId,
    name: fullName(u),
    email: u.email,
    departmentId: u.departmentId,
    branchId: u.branchId,
    employeeId: u.employee?.id ?? null,
    mustChangePassword: u.mustChangePassword,
    roles: u.roles.map((r) => ({ id: r.role.id, key: r.role.key, name: r.role.name })),
    perms,
  }
}

// ── Sessions: a random value in an httpOnly cookie; only its SHA-256 is stored in the database ──
const COOKIE = 'cx_session'
const LIFETIME = 30 * 864e5
const cookieOptions = () => ({ httpOnly: true, sameSite: 'lax' as const, secure: env.cookieSecure, path: '/' })

/** Signs the user in on this browser. */
export async function startSession(req: Request, res: Response, userId: string) {
  const raw = crypto.randomBytes(32).toString('base64url')
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  await prisma.session.create({
    data: { userId, tokenHash: sha(raw), userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300), ipAddress: req.ip.slice(0, 100), expiresAt: new Date(Date.now() + LIFETIME) },
  })
  res.cookie(COOKIE, raw, { ...cookieOptions(), maxAge: LIFETIME })
}
/** Signs this browser out. */
export async function endSession(req: Request, res: Response) {
  const raw = req.cookies[COOKIE]
  if (raw) await prisma.session.deleteMany({ where: { tokenHash: sha(raw) } })
  res.clearCookie(COOKIE, cookieOptions())
}
/** Signs the user out everywhere, except (optionally) the session making this request. */
export const endOtherSessions = (userId: string, keepSessionId?: string) =>
  prisma.session.deleteMany({ where: { userId, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) } })

/** Requires a signed-in user and puts it on req.user. */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const raw = req.cookies[COOKIE]
  if (!raw) throw new HttpError(401, 'Sign in to continue')
  const s = await prisma.session.findUnique({ where: { tokenHash: sha(raw) } })
  if (!s || s.expiresAt < new Date()) throw new HttpError(401, 'Your session has expired')
  const u = await loadUser(s.userId)
  if (!u) throw new HttpError(401, 'This account is not active')
  // Keep active people signed in: extend the session once a day.
  if (Date.now() - s.lastUsedAt.getTime() > 864e5) {
    await prisma.session.update({ where: { id: s.id }, data: { lastUsedAt: new Date(), expiresAt: new Date(Date.now() + LIFETIME) } })
    res.cookie(COOKIE, raw, { ...cookieOptions(), maxAge: LIFETIME })
  }
  req.user = u
  req.sessionId = s.id
  next()
}

export const can = (u: AuthUser, module: string, action: Action): Scope | undefined => u.perms[module]?.[action]

/** Requires a permission and puts its record scope on req.scope. */
export const authorize = (module: string, action: Action) => (req: Request, _res: Response, next: NextFunction) => {
  const s = can(req.user, module, action)
  if (!s) throw forbidden()
  req.scope = s
  next()
}

/** The user ids a scope covers. null means every record. */
export async function scopeIds(u: AuthUser, scope: Scope): Promise<string[] | null> {
  if (scope === 'ALL') return null
  if (scope === 'OWN') return [u.id]
  if (scope === 'TEAM') {
    const rows = await prisma.teamMember.findMany({ where: { team: { members: { some: { userId: u.id } } } }, select: { userId: true } })
    const led = await prisma.teamMember.findMany({ where: { team: { leadId: u.id } }, select: { userId: true } })
    return [...new Set([u.id, ...rows.map((r) => r.userId), ...led.map((r) => r.userId)])]
  }
  if (!u.departmentId) return [u.id]
  const rows = await prisma.user.findMany({ where: { organizationId: u.organizationId, departmentId: u.departmentId }, select: { id: true } })
  return [...new Set([u.id, ...rows.map((r) => r.id)])]
}
