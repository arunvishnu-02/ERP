// A small router for the REST API. Next.js hands every /api/v1 request to one route handler
// (src/app/api/v1/[...path]/route.ts); this file matches the path, runs the handlers in order
// and builds the Response. Handlers call next() to pass control on, or send a response to stop.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { env } from '../env'
import type { AuthUser, Scope } from './auth'
import { HttpError, plain } from './http'

export interface UploadedFile { filename: string; originalname: string; mimetype: string; size: number }
export interface Request {
  method: string
  /** Path below /api/v1, starting with a slash. */
  path: string
  params: Record<string, string>
  query: Record<string, string | string[] | undefined>
  body: any
  headers: Record<string, string | undefined>
  cookies: Record<string, string>
  ip: string
  user: AuthUser
  scope: Scope
  sessionId?: string
  file?: UploadedFile
  raw: globalThis.Request
}
interface CookieOptions { httpOnly?: boolean; sameSite?: 'lax' | 'strict' | 'none'; secure?: boolean; path?: string; maxAge?: number }

export class Response {
  statusCode = 200
  headers = new Headers()
  body: string | Uint8Array | null = null
  status(code: number) { this.statusCode = code; return this }
  set(name: string | Record<string, string>, value?: string) {
    if (typeof name === 'string') this.headers.set(name, String(value))
    else for (const [k, v] of Object.entries(name)) this.headers.set(k, v)
    return this
  }
  setHeader(name: string, value: string) { return this.set(name, value) }
  json(value: unknown) {
    this.headers.set('Content-Type', 'application/json; charset=utf-8')
    this.body = JSON.stringify(plain(value))
    return this
  }
  send(body: string | Uint8Array) { this.body = body; return this }
  end() { return this }
  /** maxAge is in milliseconds. */
  cookie(name: string, value: string, o: CookieOptions = {}) {
    const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${o.path ?? '/'}`]
    if (o.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(o.maxAge / 1000)}`)
    if (o.httpOnly) parts.push('HttpOnly')
    if (o.secure) parts.push('Secure')
    parts.push(`SameSite=${{ lax: 'Lax', strict: 'Strict', none: 'None' }[o.sameSite ?? 'lax']}`)
    this.headers.append('Set-Cookie', parts.join('; '))
    return this
  }
  clearCookie(name: string, o: CookieOptions = {}) { return this.cookie(name, '', { ...o, maxAge: 0 }) }
  toWeb() {
    if (!this.headers.has('Cache-Control')) this.headers.set('Cache-Control', 'no-store')
    const empty = this.statusCode === 204 || this.statusCode === 304
    return new globalThis.Response(empty ? null : (this.body as BodyInit | null), { status: this.statusCode, headers: this.headers })
  }
}

export type NextFunction = () => void
export type Handler = (req: Request, res: Response, next: NextFunction) => unknown
type ParamHook = (req: Request, res: Response, next: NextFunction, value: string) => unknown
type Layer = { kind: 'use'; segs: string[]; router?: RouterImpl; handlers: Handler[] } | { kind: 'route'; method: string; segs: string[]; handlers: Handler[] }

const split = (p: string) => p.split('/').filter(Boolean)
function match(pattern: string[], segs: string[], exact: boolean): Record<string, string> | null {
  if (exact ? pattern.length !== segs.length : pattern.length > segs.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i].startsWith(':')) params[pattern[i].slice(1)] = decodeURIComponent(segs[i])
    else if (pattern[i] !== segs[i]) return null
  }
  return params
}
/** Runs handlers in order. Returns true when every one called next(), so the search for a route continues. */
async function run(handlers: Handler[], req: Request, res: Response) {
  for (const h of handlers) {
    let passed = false
    await h(req, res, () => { passed = true })
    if (!passed) return false
  }
  return true
}

export class RouterImpl {
  private layers: Layer[] = []
  private hooks: Record<string, ParamHook> = {}

  use(...args: (string | Handler | RouterImpl)[]) {
    const prefix = typeof args[0] === 'string' ? (args.shift() as string) : '/'
    for (const a of args as (Handler | RouterImpl)[]) {
      if (a instanceof RouterImpl) this.layers.push({ kind: 'use', segs: split(prefix), router: a, handlers: [] })
      else this.layers.push({ kind: 'use', segs: split(prefix), handlers: [a] })
    }
    return this
  }
  private add(method: string, p: string, handlers: Handler[]) { this.layers.push({ kind: 'route', method, segs: split(p), handlers }); return this }
  get(p: string, ...h: Handler[]) { return this.add('GET', p, h) }
  post(p: string, ...h: Handler[]) { return this.add('POST', p, h) }
  put(p: string, ...h: Handler[]) { return this.add('PUT', p, h) }
  patch(p: string, ...h: Handler[]) { return this.add('PATCH', p, h) }
  delete(p: string, ...h: Handler[]) { return this.add('DELETE', p, h) }
  options(p: string, ...h: Handler[]) { return this.add('OPTIONS', p, h) }
  /** Runs before any route of this router that has the named :parameter. */
  param(name: string, hook: ParamHook) { this.hooks[name] = hook; return this }

  /** Returns true when a route answered the request. */
  async handle(req: Request, res: Response, segs: string[]): Promise<boolean> {
    for (const l of this.layers) {
      if (l.kind === 'route' && l.method !== req.method) continue
      const found = match(l.segs, segs, l.kind === 'route')
      if (!found) continue
      const outer = req.params
      req.params = { ...outer, ...found }
      for (const [k, v] of Object.entries(found)) if (this.hooks[k]) await this.hooks[k](req, res, () => {}, v)
      if (l.kind === 'use' && l.router) {
        if (await l.router.handle(req, res, segs.slice(l.segs.length))) return true
      } else if (!(await run(l.handlers, req, res))) return true
      req.params = outer
    }
    return false
  }
}
export const Router = (_options?: { mergeParams?: boolean }) => new RouterImpl()

/** Limits how often one address may call a group of routes. Counts are kept in memory, per server process. */
export function rateLimit(o: { windowMs: number; limit: number; message?: { message: string } }): Handler {
  const hits = new Map<string, { count: number; resetAt: number }>()
  return (req, _res, next) => {
    const now = Date.now()
    if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k)
    const h = hits.get(req.ip)
    if (!h || h.resetAt < now) hits.set(req.ip, { count: 1, resetAt: now + o.windowMs })
    else if (++h.count > o.limit) throw new HttpError(429, o.message?.message ?? 'Too many requests. Wait a minute and try again.')
    next()
  }
}

const MAX_UPLOAD = 25 * 1024 * 1024
/** Reads a multipart form, saves the file from the named field under the upload folder, and puts the other fields on req.body. */
export const upload = {
  single: (field: string): Handler => async (req, _res, next) => {
    if (!(req.headers['content-type'] ?? '').includes('multipart/form-data')) return next()
    if (Number(req.headers['content-length'] ?? 0) > MAX_UPLOAD + 1024 * 1024) throw new HttpError(413, 'That file is too large. The limit is 25 MB.')
    let form: FormData
    try { form = await req.raw.formData() } catch { throw new HttpError(400, 'The upload could not be read') }
    const body: Record<string, string> = {}
    for (const [k, v] of form.entries()) if (typeof v === 'string') body[k] = v
    req.body = body
    const f = form.get(field)
    if (f && typeof f !== 'string') {
      if (f.size > MAX_UPLOAD) throw new HttpError(413, 'That file is too large. The limit is 25 MB.')
      const dir = path.join(env.uploadDir, req.user.organizationId)
      await fs.mkdir(dir, { recursive: true })
      const filename = crypto.randomUUID() + path.extname(f.name).slice(0, 12).replace(/[^.\w]/g, '')
      await fs.writeFile(path.join(dir, filename), Buffer.from(await f.arrayBuffer()))
      req.file = { filename, originalname: f.name, mimetype: f.type || 'application/octet-stream', size: f.size }
    }
    next()
  },
}
