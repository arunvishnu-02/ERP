// Sign in with Google, the Google Workspace card in Settings > Integrations, "Save to Drive" and "Send to Google Sheets".
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { authenticate, authorize, can, startSession } from '../core/auth'
import { authUrl, exchangeCode, folderUrl, loadGoogle, redirectUri, revoke, saveGoogle, uploadToDrive, writeSheet } from '../core/google'
import { bad, forbidden, HttpError, isUuid, notFound, parse, shape } from '../core/http'
import { rateLimit, Router, type Request, type Response } from '../core/router'
import { audit } from '../core/util'
import { prisma, type Tx } from '../db'
import { env } from '../env'

const S = 'SETTINGS'
// Remembers, for ten minutes, which sign-in this browser started: "login.<state>" or "connect.<state>.<userId>".
const STATE_COOKIE = 'cx_google'
const stateCookie = () => ({ httpOnly: true, sameSite: 'lax' as const, secure: env.cookieSecure, path: '/api/v1/auth/google' })
const limiter = rateLimit({ windowMs: 60_000, limit: 20, message: { message: 'Too many attempts. Wait a minute and try again.' } })
const go = (res: Response, to: string) => res.status(302).set('Location', to.startsWith('http') ? to : `${env.appUrl}${to}`).end()

// ── Public: /auth/google ──
export const googleAuthRouter = Router()

/** The company's Google settings. The app serves one company, so sign-in uses the first one. */
const company = () => prisma.organization.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } })
export async function googleSignInOn() {
  const org = await company()
  if (!org) return false
  const { config, secret } = await loadGoogle(org.id)
  return !!(config.signIn && config.clientId && secret.clientSecret)
}

googleAuthRouter.get('/', limiter, async (_req, res) => {
  const org = await company()
  const g = org ? await loadGoogle(org.id) : null
  if (!g?.config.signIn || !g.config.clientId || !g.secret.clientSecret) return go(res, '/login?google=off')
  const state = crypto.randomBytes(24).toString('base64url')
  res.cookie(STATE_COOKIE, `login.${state}`, { ...stateCookie(), maxAge: 10 * 60_000 })
  go(res, authUrl(g.config.clientId, state, 'login', g.config.allowedDomain || undefined))
})

googleAuthRouter.get('/callback', limiter, async (req, res) => {
  const [mode, state, userId] = String(req.cookies[STATE_COOKIE] ?? '').split('.')
  res.clearCookie(STATE_COOKIE, stateCookie())
  const back = mode === 'connect' ? '/settings?tab=integrations&google=' : '/login?google='
  const sent = String(req.query.state ?? '')
  if (!state || sent.length !== state.length || !crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(state))) return go(res, `${back}expired`)
  if (req.query.error || !req.query.code) return go(res, `${back}cancelled`)
  const org = await company()
  if (!org) return go(res, '/setup')
  const { config, secret } = await loadGoogle(org.id)
  if (!config.clientId || !secret.clientSecret) return go(res, `${back}off`)
  let got: Awaited<ReturnType<typeof exchangeCode>>
  try { got = await exchangeCode(config.clientId, secret.clientSecret, String(req.query.code)) } catch { return go(res, `${back}failed`) }
  const { claims } = got
  const email = claims.email?.toLowerCase()
  if (!email || claims.email_verified === false) return go(res, `${back}unverified`)
  if (config.allowedDomain && claims.hd !== config.allowedDomain) return go(res, `${back}domain`)

  if (mode === 'connect') {
    // only the admin who pressed Connect, still signed in and still allowed, can finish it
    try { await authenticate(req, res, () => {}) } catch { return go(res, '/login') }
    if (req.user.id !== userId || req.user.organizationId !== org.id || !can(req.user, S, 'EDIT')) return go(res, `${back}denied`)
    const refreshToken = got.refreshToken ?? secret.refreshToken
    if (!refreshToken) return go(res, `${back}failed`)
    if (got.refreshToken && secret.refreshToken && got.refreshToken !== secret.refreshToken) await revoke(secret.refreshToken)
    await saveGoogle(org.id, { ...config, connectedEmail: email, connectedAt: new Date().toISOString() }, { ...secret, refreshToken })
    await audit(prisma as unknown as Tx, req, 'UPDATE', S, 'IntegrationSetting', null, null, { google: 'connected', email })
    return go(res, `${back}connected`)
  }

  if (!config.signIn) return go(res, `${back}off`)
  const user = await prisma.user.findFirst({ where: { organizationId: org.id, deletedAt: null, OR: [{ googleSub: claims.sub }, { email }] }, orderBy: { googleSub: 'desc' } })
  const ok = !!user && user.status === 'ACTIVE' && (!user.googleSub || user.googleSub === claims.sub)
  if (user) await prisma.auditLog.create({ data: { organizationId: org.id, userId: user.id, action: ok ? 'LOGIN' : 'LOGIN_FAILED', entityType: 'User', entityId: user.id, after: { by: 'Google' }, ipAddress: req.ip.slice(0, 100), userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300) } })
  if (!ok || !user) return go(res, `${back}nouser`)
  await prisma.user.update({ where: { id: user.id }, data: { googleSub: claims.sub, lastLoginAt: new Date(), emailVerifiedAt: user.emailVerifiedAt ?? new Date() } })
  await startSession(req, res, user.id)
  go(res, '/dashboard')
})

// ── Settings > Integrations ──
export const integrationsRouter = Router()

integrationsRouter.get('/', authorize(S, 'VIEW'), async (req, res) => {
  const organizationId = req.user.organizationId
  const [{ config, secret }, smtp] = await Promise.all([
    loadGoogle(organizationId),
    prisma.integrationSetting.findUnique({ where: { organizationId_provider: { organizationId, provider: 'SMTP' } } }),
  ])
  const mail = (smtp?.config ?? {}) as { host?: string; fromEmail?: string }
  res.json({
    google: {
      clientId: config.clientId ?? '', hasSecret: !!secret.clientSecret, allowedDomain: config.allowedDomain ?? '', signIn: !!config.signIn, folderName: config.folderName || 'CX CRM ERP',
      connected: !!secret.refreshToken, connectedEmail: config.connectedEmail ?? null, connectedAt: config.connectedAt ?? null, folderUrl: folderUrl(config.folderId), redirectUri: redirectUri(),
      linkedUsers: await prisma.user.count({ where: { organizationId, googleSub: { not: null }, deletedAt: null } }),
    },
    smtp: { active: !!(smtp?.isActive && mail.host), fromEmail: mail.fromEmail ?? null },
  })
})

integrationsRouter.put('/google', authorize(S, 'EDIT'), async (req, res) => {
  const d = parse(shape({ clientId: 's', clientSecret: 's?', allowedDomain: 's?', signIn: 'b?', folderName: 's?' }), req.body)
  const clientId = d.clientId.trim()
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw bad('The client ID should end with .apps.googleusercontent.com')
  const domain = (d.allowedDomain ?? '').trim().toLowerCase().replace(/^@/, '')
  if (domain && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) throw bad('Write the domain like ciphermutex.com')
  const { config, secret } = await loadGoogle(req.user.organizationId)
  const next = { ...secret, ...(d.clientSecret?.trim() ? { clientSecret: d.clientSecret.trim() } : {}) }
  if (!next.clientSecret) throw bad('Paste the client secret too')
  // a different OAuth client cannot use the old connection
  if (config.clientId && config.clientId !== clientId && next.refreshToken) { await revoke(next.refreshToken); delete next.refreshToken }
  const changed = { ...config, clientId, allowedDomain: domain || undefined, signIn: !!d.signIn, folderName: d.folderName?.trim() || config.folderName }
  if (!next.refreshToken) { delete changed.connectedEmail; delete changed.connectedAt }
  await saveGoogle(req.user.organizationId, changed, next)
  await audit(prisma as unknown as Tx, req, 'UPDATE', S, 'IntegrationSetting', null, null, { google: { clientId, allowedDomain: domain || null, signIn: !!d.signIn } })
  res.status(204).end()
})

/** Starts connecting the company's Google account for Drive and Sheets. The browser goes to the returned address. */
integrationsRouter.post('/google/connect', authorize(S, 'EDIT'), async (req, res) => {
  const { config, secret } = await loadGoogle(req.user.organizationId)
  if (!config.clientId || !secret.clientSecret) throw bad('Save the client ID and secret first')
  const state = crypto.randomBytes(24).toString('base64url')
  res.cookie(STATE_COOKIE, `connect.${state}.${req.user.id}`, { ...stateCookie(), maxAge: 10 * 60_000 })
  res.json({ url: authUrl(config.clientId, state, 'connect', config.allowedDomain || undefined) })
})

integrationsRouter.delete('/google/connection', authorize(S, 'EDIT'), async (req, res) => {
  const { config, secret } = await loadGoogle(req.user.organizationId)
  if (secret.refreshToken) await revoke(secret.refreshToken)
  const { connectedEmail: _e, connectedAt: _a, ...rest } = config
  await saveGoogle(req.user.organizationId, rest, { clientSecret: secret.clientSecret })
  await audit(prisma as unknown as Tx, req, 'UPDATE', S, 'IntegrationSetting', null, null, { google: 'disconnected' })
  res.status(204).end()
})

// ── Drive and Sheets, for anyone signed in, within their own permissions ──
export const googleRouter = Router()

/** Saves a copy of an uploaded file to the company folder in Drive. Anyone who may download the file may do this. */
googleRouter.post('/drive/files/:id', async (req, res) => {
  const f = isUuid(req.params.id) ? await prisma.file.findFirst({ where: { id: String(req.params.id), organizationId: req.user.organizationId } }) : null
  const full = f ? path.resolve(env.uploadDir, f.key) : ''
  if (!f || !full.startsWith(path.resolve(env.uploadDir)) || !fs.existsSync(full)) throw notFound('File')
  if (f.driveFileId && f.driveUrl) return res.json({ url: f.driveUrl, already: true })
  const up = await uploadToDrive(req.user.organizationId, { name: f.fileName, mimeType: f.mimeType, data: await fs.promises.readFile(full) })
  await prisma.file.update({ where: { id: f.id }, data: { driveFileId: up.id, driveUrl: up.url.slice(0, 500) } })
  res.json({ url: up.url })
})

const MAX_CELLS = 200_000
/**
 * Sends a list the person is looking at to a new Google Sheet. The rows come from the page, which only ever
 * received what this person may see; the person also needs the Export permission for that module.
 */
googleRouter.post('/sheets', async (req: Request, res) => {
  const b = req.body ?? {}
  const title = typeof b.title === 'string' ? b.title.trim().slice(0, 150) : ''
  if (!title) throw bad('Give the sheet a name')
  if (typeof b.module !== 'string' || !can(req.user, b.module, 'EXPORT')) throw forbidden('You do not have permission to export this list')
  const ok = (v: unknown) => v === null || typeof v === 'string' || typeof v === 'number'
  if (!Array.isArray(b.rows) || !b.rows.every((r: unknown) => Array.isArray(r) && r.every(ok))) throw bad('The list could not be read')
  const cells = b.rows.reduce((n: number, r: unknown[]) => n + r.length, 0)
  if (cells > MAX_CELLS) throw new HttpError(413, 'This list is too big for one sheet. Filter it first.')
  const rows = b.rows.map((r: (string | number | null)[]) => r.map((v) => (typeof v === 'string' ? v.slice(0, 5000) : v)))
  res.json(await writeSheet(req.user.organizationId, title, rows))
})
