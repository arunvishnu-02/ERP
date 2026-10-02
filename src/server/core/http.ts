import { z } from 'zod'
import { ConfigError } from '../env'
import type { Response } from './router'

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message)
  }
}
export const bad = (message: string, details?: unknown) => new HttpError(400, message, details)
export const notFound = (what = 'Record') => new HttpError(404, `${what} not found`)
export const forbidden = (message = 'You do not have permission to do this') => new HttpError(403, message)
export const conflict = (message: string) => new HttpError(409, message)

/** Makes database rows safe to send: decimals become numbers, secrets and raw bytes are dropped. */
export function plain(v: any): any {
  if (v === null || v === undefined) return v
  if (typeof v === 'bigint') return Number(v)
  if (typeof v !== 'object') return v
  if (v instanceof Date) return v
  if (v instanceof Uint8Array) return undefined
  if (typeof v.toFixed === 'function' && 'd' in v && 'e' in v && 's' in v) return Number(v)
  if (Array.isArray(v)) return v.map(plain)
  const o: any = {}
  for (const k of Object.keys(v)) {
    if (k === 'passwordHash' || k === 'twoFactorSecret') continue
    o[k] = plain(v[k])
  }
  return o
}

/**
 * Compact field specs for request bodies.
 * 's' text, 'n' number, 'i' whole number, 'b' yes/no, 'd' date, 'id' record id, 's[]' list of text, 'j' any JSON.
 * Add '?' to make a field optional. A list of values means "one of these"; put '?' on the key to make that optional.
 */
export type Spec = Record<string, string | readonly string[]>
const emptyToNull = (v: unknown) => (v === '' ? null : v)
const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v)
const toDate = (v: unknown) => (typeof v === 'string' && v ? new Date(v.length === 10 ? `${v}T00:00:00.000Z` : v) : v)

function one(t: string | readonly string[]): z.ZodTypeAny {
  if (typeof t !== 'string') return z.enum(t as [string, ...string[]])
  const opt = t.endsWith('?')
  const base = opt ? t.slice(0, -1) : t
  let s: z.ZodTypeAny
  switch (base) {
    case 's': s = z.string().trim().min(opt ? 0 : 1, 'Required').max(10000); break
    case 'n': s = z.coerce.number(); break
    case 'i': s = z.coerce.number().int(); break
    case 'b': s = z.boolean(); break
    case 'd': s = z.preprocess(toDate, z.date()); break
    case 'id': s = z.string().uuid(); break
    case 's[]': s = z.array(z.string()); break
    case 'j': s = z.any(); break
    default: throw new Error(`Unknown field type ${t}`)
  }
  return opt ? z.preprocess(emptyToNull, s.nullable().optional()) : s
}

export function shape(spec: Spec) {
  const o: Record<string, z.ZodTypeAny> = {}
  for (const [k, t] of Object.entries(spec)) {
    if (k.endsWith('?')) o[k.slice(0, -1)] = z.preprocess(emptyToUndefined, one(t).optional())
    else o[k] = one(t)
  }
  return z.object(o)
}

export function parse(schema: z.ZodTypeAny, data: unknown): any {
  const r = schema.safeParse(data ?? {})
  if (!r.success) {
    throw bad('Please check the highlighted fields', r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })))
  }
  return r.data
}

export const stripNulls = (o: any) => {
  for (const k of Object.keys(o)) if (o[k] === null || o[k] === undefined) delete o[k]
  return o
}

export const isUuid = (s: unknown) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

const DB_DOWN = /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH|ER_ACCESS_DENIED|ER_DBACCESS_DENIED|ER_BAD_DB_ERROR|ER_GET_CONNECTION_TIMEOUT|pool timeout|Can't reach database|socket has unexpectedly been closed/i
const dbReason = (text: string) =>
  /ER_ACCESS_DENIED|ER_DBACCESS_DENIED/.test(text) ? 'the user name or password was refused' : /ER_BAD_DB_ERROR/.test(text) ? 'the database name does not exist' : 'the database server did not answer'

/** Turns any error into a JSON answer with a message that is safe to show. */
export function errorHandler(err: any, res: Response) {
  const text = `${err?.code ?? ''} ${err?.message ?? ''} ${err?.cause?.code ?? ''} ${err?.cause?.message ?? ''}`
  if (err instanceof HttpError) return res.status(err.status).json({ message: err.message, errors: err.details })
  if (err instanceof ConfigError) return res.status(503).json({ message: `The app is not set up yet. ${err.message}` })
  if (/^P10\d\d /.test(text) || DB_DOWN.test(text)) {
    console.error(err)
    return res.status(503).json({ message: `The database cannot be reached: ${dbReason(text)}. Check DATABASE_URL.` })
  }
  if (err?.code === 'P2000') return res.status(400).json({ message: 'One of the values is too long' })
  if (err?.code === 'P2002') return res.status(409).json({ message: 'A record with these details already exists' })
  if (err?.code === 'P2003') return res.status(409).json({ message: 'This record is linked to other records, so it cannot be removed' })
  if (err?.code === 'P2025') return res.status(404).json({ message: 'Record not found' })
  if (err?.name === 'PrismaClientValidationError') {
    console.error(err.message)
    return res.status(400).json({ message: 'Some values are not valid for this record' })
  }
  if (err?.code === 'P2023' || /Inconsistent column data/i.test(text)) return res.status(404).json({ message: 'Record not found' })
  console.error(err)
  res.status(500).json({ message: 'Something went wrong on the server' })
}
