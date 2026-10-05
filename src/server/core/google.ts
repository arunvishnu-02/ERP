// Google Workspace: "Sign in with Google" for staff, and one Google account the company connects
// so the app can save files to Drive and send lists to Google Sheets.
import crypto from 'node:crypto'
import { prisma } from '../db'
import { env } from '../env'
import { HttpError } from './http'
import { decrypt, encrypt } from './util'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const DRIVE = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets'
// drive.file only reaches files this app made, so the app never sees the rest of the company's Drive
const CONNECT_SCOPES = 'openid email https://www.googleapis.com/auth/drive.file'
const FOLDER = 'application/vnd.google-apps.folder'

/** Non-secret settings, kept as plain JSON. */
export type GoogleConfig = { clientId?: string; allowedDomain?: string; signIn?: boolean; folderName?: string; folderId?: string; connectedEmail?: string; connectedAt?: string }
/** Kept encrypted. */
type GoogleSecret = { clientSecret?: string; refreshToken?: string }

const where = (organizationId: string) => ({ organizationId_provider: { organizationId, provider: 'GOOGLE' as const } })

export async function loadGoogle(organizationId: string) {
  const row = await prisma.integrationSetting.findUnique({ where: where(organizationId) })
  const config = (row?.config ?? {}) as GoogleConfig
  const secret: GoogleSecret = row?.secretCiphertext ? JSON.parse(decrypt(row) || '{}') : {}
  return { config, secret }
}

export async function saveGoogle(organizationId: string, config: GoogleConfig, secret: GoogleSecret) {
  const data = { config, isActive: !!secret.refreshToken, ...encrypt(JSON.stringify(secret)) }
  await prisma.integrationSetting.upsert({ where: where(organizationId), create: { organizationId, provider: 'GOOGLE', ...data }, update: data })
  tokens.delete(organizationId)
}

/** The address Google sends people back to. It must be added to the OAuth client in Google Cloud exactly as shown. */
export const redirectUri = () => `${env.appUrl}/api/v1/auth/google/callback`
export const folderUrl = (id?: string) => (id ? `https://drive.google.com/drive/folders/${id}` : null)

export function authUrl(clientId: string, state: string, mode: 'login' | 'connect', domain?: string) {
  const p = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri(), response_type: 'code', state })
  if (mode === 'login') { p.set('scope', 'openid email profile'); p.set('prompt', 'select_account') }
  else { p.set('scope', CONNECT_SCOPES); p.set('prompt', 'consent'); p.set('access_type', 'offline') }
  if (domain) p.set('hd', domain)
  return `${AUTH_URL}?${p}`
}

async function tokenCall(body: Record<string, string>) {
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) })
  return { ok: r.ok, json: (await r.json().catch(() => ({}))) as any }
}

/**
 * Swaps the one-time code for tokens. The id token comes straight from Google's token address over TLS,
 * so its claims can be read without checking its signature (OpenID Connect Core 3.1.3.7); audience, issuer and expiry are still checked.
 */
export async function exchangeCode(clientId: string, clientSecret: string, code: string) {
  const { ok, json } = await tokenCall({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri(), grant_type: 'authorization_code' })
  if (!ok || typeof json.id_token !== 'string') throw new HttpError(400, 'Google did not accept the sign-in')
  let claims: any
  try { claims = JSON.parse(Buffer.from(json.id_token.split('.')[1], 'base64url').toString('utf8')) } catch { throw new HttpError(400, 'Google sent an answer the app could not read') }
  const issuerOk = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com'
  if (claims.aud !== clientId || !issuerOk || !(Number(claims.exp) * 1000 > Date.now())) throw new HttpError(400, 'Google sent an answer for another app')
  return { claims: claims as { sub: string; email?: string; email_verified?: boolean; hd?: string; name?: string }, refreshToken: json.refresh_token as string | undefined }
}

export async function revoke(token: string) {
  await fetch(`${REVOKE_URL}?${new URLSearchParams({ token })}`, { method: 'POST' }).catch(() => {})
}

// Access tokens last about an hour; keep one per company in memory instead of asking Google on every call.
const tokens = new Map<string, { token: string; until: number }>()
const notConnected = () => new HttpError(409, 'Google Drive is not connected. An admin can connect it in Settings > Integrations.')

async function accessToken(organizationId: string) {
  const hit = tokens.get(organizationId)
  if (hit && hit.until > Date.now()) return hit.token
  const { config, secret } = await loadGoogle(organizationId)
  if (!config.clientId || !secret.clientSecret || !secret.refreshToken) throw notConnected()
  const { ok, json } = await tokenCall({ client_id: config.clientId, client_secret: secret.clientSecret, refresh_token: secret.refreshToken, grant_type: 'refresh_token' })
  if (!ok) {
    if (json.error === 'invalid_grant') throw new HttpError(409, 'Google access was removed or has expired. Connect Google again in Settings > Integrations.')
    throw new HttpError(502, 'Google could not be reached. Try again in a moment.')
  }
  tokens.set(organizationId, { token: json.access_token, until: Date.now() + (Number(json.expires_in) || 3600) * 1000 - 60_000 })
  return json.access_token as string
}

async function gapi(organizationId: string, url: string, init: { method?: string; json?: unknown; body?: BodyInit; headers?: Record<string, string> } = {}) {
  const token = await accessToken(organizationId)
  const r = await fetch(url, {
    method: init.method ?? (init.json || init.body ? 'POST' : 'GET'),
    headers: { authorization: `Bearer ${token}`, ...(init.json ? { 'content-type': 'application/json' } : {}), ...init.headers },
    body: init.json ? JSON.stringify(init.json) : init.body,
  })
  if (r.status === 401) tokens.delete(organizationId)
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new HttpError(502, `Google refused the request: ${j.error?.message ?? r.statusText}`), { googleStatus: r.status })
  return j
}

/** The company's folder in Drive, made on first use and again if someone deletes it. */
async function folder(organizationId: string) {
  const { config, secret } = await loadGoogle(organizationId)
  if (config.folderId) {
    const f = await gapi(organizationId, `${DRIVE}/${config.folderId}?fields=id,trashed`).catch((e) => (e.googleStatus === 404 ? null : Promise.reject(e)))
    if (f && !f.trashed) return config.folderId
  }
  const made = await gapi(organizationId, `${DRIVE}?fields=id`, { json: { name: config.folderName || 'CX CRM ERP', mimeType: FOLDER } })
  await saveGoogle(organizationId, { ...config, folderId: made.id }, secret)
  return made.id as string
}

/** Uploads one file into the company folder and returns its Drive id and link. */
export async function uploadToDrive(organizationId: string, f: { name: string; mimeType: string; data: Uint8Array }) {
  const parent = await folder(organizationId)
  const b = `cx${crypto.randomBytes(12).toString('hex')}`
  const body = Buffer.concat([
    Buffer.from(`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: f.name, parents: [parent] })}\r\n--${b}\r\nContent-Type: ${f.mimeType}\r\n\r\n`),
    Buffer.from(f.data),
    Buffer.from(`\r\n--${b}--`),
  ])
  const r = await gapi(organizationId, `${UPLOAD}?uploadType=multipart&fields=id,webViewLink`, { body, headers: { 'content-type': `multipart/related; boundary=${b}` } })
  return { id: r.id as string, url: (r.webViewLink as string) ?? `https://drive.google.com/file/d/${r.id}/view` }
}

/** Makes a new spreadsheet in the company folder, fills it with the rows (first row is the heading) and returns its link. */
export async function writeSheet(organizationId: string, title: string, rows: (string | number | null)[][]) {
  const parent = await folder(organizationId)
  const made = await gapi(organizationId, `${DRIVE}?fields=id,webViewLink`, { json: { name: title, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [parent] } })
  const id = made.id as string
  if (rows.length) await gapi(organizationId, `${SHEETS}/${id}/values/A1?valueInputOption=RAW`, { method: 'PUT', json: { values: rows.map((r) => r.map((v) => v ?? '')) } })
  // bold, frozen heading row
  await gapi(organizationId, `${SHEETS}/${id}:batchUpdate`, {
    json: { requests: [
      { updateSheetProperties: { properties: { sheetId: 0, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
      { repeatCell: { range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } },
    ] },
  })
  return { id, url: (made.webViewLink as string) ?? `https://docs.google.com/spreadsheets/d/${id}/edit` }
}
