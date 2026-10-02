import crypto from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'
import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../db.js'
import { env } from '../env.js'
import { forbidden, HttpError } from './http.js'

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

declare global {
  namespace Express {
    interface Request {
      user: AuthUser
      scope: Scope
    }
  }
}

export const hashPassword = (p: string) => hash(p)
export const verifyPassword = (h: string, p: string) => verify(h, p).catch(() => false)
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

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) throw new HttpError(401, 'Sign in to continue')
  let sub: string
  try {
    sub = String((jwt.verify(h.slice(7), env.jwtSecret) as jwt.JwtPayload).sub)
  } catch {
    throw new HttpError(401, 'Your session has expired')
  }
  const u = await loadUser(sub)
  if (!u) throw new HttpError(401, 'This account is not active')
  req.user = u
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

const COOKIE = 'cx_rt'
const cookieOptions = () => ({ httpOnly: true, sameSite: 'lax' as const, secure: env.cookieSecure, path: '/api/v1/auth' })

export async function issueTokens(req: Request, res: Response, user: { id: string; organizationId: string }, family?: string) {
  const raw = crypto.randomBytes(48).toString('base64url')
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha(raw),
      family: family ?? crypto.randomUUID(),
      userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300),
      ipAddress: req.ip,
      expiresAt: new Date(Date.now() + 30 * 864e5),
    },
  })
  res.cookie(COOKIE, raw, { ...cookieOptions(), maxAge: 30 * 864e5 })
  return jwt.sign({ org: user.organizationId }, env.jwtSecret, { subject: user.id, expiresIn: '15m' })
}
export const readRefreshCookie = (req: Request): string | undefined => req.cookies?.[COOKIE]
export const clearRefreshCookie = (res: Response) => res.clearCookie(COOKIE, cookieOptions())
