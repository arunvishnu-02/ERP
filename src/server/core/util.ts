import crypto from 'node:crypto'
import type { Request } from './router'
import type { Tx } from '../db'
import { env } from '../env'
import type { Scope } from './auth'
import { can, scopeIds } from './auth'
import { bad, plain } from './http'

export const STATES = [
  ['01', 'Jammu and Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'], ['05', 'Uttarakhand'], ['06', 'Haryana'],
  ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'], ['10', 'Bihar'], ['11', 'Sikkim'], ['12', 'Arunachal Pradesh'],
  ['13', 'Nagaland'], ['14', 'Manipur'], ['15', 'Mizoram'], ['16', 'Tripura'], ['17', 'Meghalaya'], ['18', 'Assam'], ['19', 'West Bengal'],
  ['20', 'Jharkhand'], ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'],
  ['26', 'Dadra and Nagar Haveli and Daman and Diu'], ['27', 'Maharashtra'], ['29', 'Karnataka'], ['30', 'Goa'], ['31', 'Lakshadweep'],
  ['32', 'Kerala'], ['33', 'Tamil Nadu'], ['34', 'Puducherry'], ['35', 'Andaman and Nicobar Islands'], ['36', 'Telangana'],
  ['37', 'Andhra Pradesh'], ['38', 'Ladakh'], ['99', 'Outside India'],
].map(([code, name]) => ({ code, name }))
export const EXPORT_CODE = '99'
export const stateName = (code?: string | null) => STATES.find((s) => s.code === code)?.name ?? null
export const stateCode = (name?: string | null) => STATES.find((s) => s.name === name)?.code ?? null

export const U = { select: { id: true, firstName: true, lastName: true } } as const

// Dates: date-only columns are stored as UTC midnight; "today" follows the app timezone.
export const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: env.timezone }).format(new Date())
export const dateOnly = (s: string) => new Date(`${s}T00:00:00.000Z`)
export const today = () => dateOnly(todayStr())
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 864e5)
export const ymd = (d: Date) => d.toISOString().slice(0, 10)
export const daysBetween = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 864e5)
export const hourNow = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: env.timezone, hour: '2-digit', hour12: false }).format(new Date()))
export function financialYear(day: string, startMonth = 4) {
  const [y, m] = day.split('-').map(Number)
  const start = m >= startMonth ? y : y - 1
  return startMonth === 1 ? String(start) : `${String(start).slice(2)}-${String(start + 1).slice(2)}`
}

const CODES: Record<string, string> = {
  LEAD: 'LD', CUSTOMER: 'CU', DEAL: 'DL', QUOTATION: 'QT', INVOICE: 'INV', CREDIT_NOTE: 'CN', RECEIPT: 'RCT',
  PROJECT: 'PRJ', TASK: 'TSK', TICKET: 'TKT', EXPENSE: 'EXP', EMPLOYEE: 'EMP', ASSET: 'AST',
}
/** Next document number, e.g. CX/INV/26-27/0001. Safe when two people save at the same moment. */
export async function nextNumber(tx: Tx, organizationId: string, type: string) {
  const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { settings: true, financialYearStartMonth: true } })
  const fy = financialYear(todayStr(), org.financialYearStartMonth)
  const prefix = `${(org.settings as any)?.docPrefix || 'CX'}/${CODES[type]}`
  const seq = await tx.numberSequence.upsert({
    where: { organizationId_type_financialYear: { organizationId, type: type as any, financialYear: fy } },
    create: { organizationId, type: type as any, financialYear: fy, prefix, nextNumber: 2 },
    update: { nextNumber: { increment: 1 } },
  })
  return `${prefix}/${fy}/${String(seq.nextNumber - 1).padStart(seq.padding, '0')}`
}

export interface LineIn {
  serviceId?: string | null
  milestoneId?: string | null
  description: string
  sacCode?: string | null
  quantity: number
  unit?: string | null
  unitPrice: number
  discountPercent?: number | null
  taxRate?: number | null
}
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
/** GST for a document: CGST + SGST inside the state, IGST across states, zero for export or when the company is not GST registered. */
export function computeDoc(lines: LineIn[], o: { interState: boolean; exportSale: boolean; noGst?: boolean }) {
  const t = { subtotal: 0, discountTotal: 0, taxableAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalAmount: 0 }
  const items = lines.map((l, position) => {
    const gross = r2(Number(l.quantity) * Number(l.unitPrice))
    const discount = r2((gross * Number(l.discountPercent ?? 0)) / 100)
    const taxableAmount = r2(gross - discount)
    const taxRate = o.noGst ? 0 : Number(l.taxRate ?? 18)
    const tax = o.exportSale ? 0 : r2((taxableAmount * taxRate) / 100)
    const igstAmount = o.interState ? tax : 0
    const cgstAmount = o.interState ? 0 : r2(tax / 2)
    const sgstAmount = o.interState ? 0 : r2(tax - cgstAmount)
    t.subtotal += gross; t.discountTotal += discount; t.taxableAmount += taxableAmount
    t.cgstAmount += cgstAmount; t.sgstAmount += sgstAmount; t.igstAmount += igstAmount
    return {
      position, description: l.description, sacCode: l.sacCode || null, quantity: Number(l.quantity), unit: l.unit || 'nos',
      unitPrice: Number(l.unitPrice), discountPercent: Number(l.discountPercent ?? 0), taxRate, taxableAmount, cgstAmount, sgstAmount, igstAmount,
      lineTotal: r2(taxableAmount + tax), serviceId: l.serviceId || null,
    }
  })
  for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] = r2(t[k])
  t.totalAmount = r2(t.taxableAmount + t.cgstAmount + t.sgstAmount + t.igstAmount)
  return { items, totals: t }
}

export async function taxContext(tx: Tx, organizationId: string, p: { customerId?: string | null; leadId?: string | null }) {
  const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { stateCode: true, settings: true } })
  const noGst = gstOff(org.settings)
  let code = org.stateCode
  let exportSale = false
  if (p.customerId) {
    const c = await tx.customer.findFirst({ where: { id: p.customerId, organizationId } })
    if (!c) throw bad('Choose a customer')
    code = c.billingStateCode ?? org.stateCode
    exportSale = c.isExport || c.billingStateCode === EXPORT_CODE
  } else if (p.leadId) {
    const l = await tx.lead.findFirst({ where: { id: p.leadId, organizationId } })
    if (!l) throw bad('Choose a lead')
    code = stateCode(l.state) ?? org.stateCode
    exportSale = code === EXPORT_CODE
  }
  return { placeOfSupply: code, interState: !noGst && !exportSale && !!code && !!org.stateCode && code !== org.stateCode, exportSale, noGst }
}
/** True when the company has said it is not registered for GST: documents then carry no GST at all. */
export const gstOff = (settings: unknown) => (settings as any)?.gstRegistered === false

export async function audit(tx: Tx, req: Pick<Request, 'user' | 'ip' | 'headers'>, action: string, module: string | null, entityType: string, entityId?: string | null, before?: unknown, after?: unknown) {
  const json = (v: unknown) => (v === undefined || v === null ? undefined : JSON.parse(JSON.stringify(plain(v))))
  await tx.auditLog.create({
    data: {
      organizationId: req.user.organizationId, userId: req.user.id, action: action as any, module: module as any, entityType, entityId: entityId ?? null,
      before: json(before), after: json(after), ipAddress: req.ip ?? null, userAgent: String(req.headers?.['user-agent'] ?? '').slice(0, 300),
    },
  })
}

export const activity = (tx: Tx, organizationId: string, entityType: string, entityId: string, type: string, summary: string, actorId?: string | null) =>
  tx.activity.create({ data: { organizationId, entityType: entityType as any, entityId, type: type as any, summary: summary.slice(0, 1000), actorId: actorId ?? null } })

export const notify = (tx: Tx, organizationId: string, userId: string, type: string, title: string, link?: string) =>
  tx.notification.create({ data: { organizationId, userId, type, title: title.slice(0, 300), link: link ?? null } })

/** Users who hold a permission, e.g. everyone who can approve quotations. */
export async function usersWith(tx: Tx, organizationId: string, module: string, action: string) {
  const rows = await tx.user.findMany({
    where: { organizationId, status: 'ACTIVE', deletedAt: null, roles: { some: { role: { permissions: { some: { permission: { module: module as any, action: action as any } } } } } } },
    select: { id: true },
  })
  return rows.map((r) => r.id)
}

// Read when first needed, so the rest of the app works before the key is set.
const key = () => Buffer.from(env.encryptionKey, 'hex')
export function encrypt(text: string) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([c.update(text, 'utf8'), c.final()])
  return { secretCiphertext: ct, secretIv: iv, secretAuthTag: c.getAuthTag() }
}
export function decrypt(r: { secretCiphertext: Uint8Array | null; secretIv: Uint8Array | null; secretAuthTag: Uint8Array | null }) {
  if (!r.secretCiphertext || !r.secretIv || !r.secretAuthTag) return ''
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(r.secretIv))
  d.setAuthTag(Buffer.from(r.secretAuthTag))
  return Buffer.concat([d.update(Buffer.from(r.secretCiphertext)), d.final()]).toString('utf8')
}

/** Which records a user may reach in each module when their scope is not "all". */
export const SCOPES: Record<string, (ids: string[]) => any> = {
  LEADS: (ids) => ({ ownerId: { in: ids } }),
  CUSTOMERS: (ids) => ({ accountManagerId: { in: ids } }),
  SALES: (ids) => ({ ownerId: { in: ids } }),
  QUOTATIONS: (ids) => ({ preparedById: { in: ids } }),
  INVOICES: (ids) => ({ customer: { accountManagerId: { in: ids } } }),
  PAYMENTS: (ids) => ({ customer: { accountManagerId: { in: ids } } }),
  PROJECTS: (ids) => ({ OR: [{ managerId: { in: ids } }, { members: { some: { userId: { in: ids } } } }] }),
  TASKS: (ids) => ({ OR: [{ assigneeId: { in: ids } }, { reporterId: { in: ids } }] }),
  TICKETS: (ids) => ({ OR: [{ assigneeId: { in: ids } }, { createdById: { in: ids } }] }),
  CAMPAIGNS: (ids) => ({ managerId: { in: ids } }),
  CONTENT: (ids) => ({ OR: [{ assigneeId: { in: ids } }, { campaign: { managerId: { in: ids } } }] }),
}
/** Where-clause for a module and action, or null when the user has no such permission. */
export async function scoped(req: Request, module: string, action: 'VIEW' | 'EDIT' | 'DELETE' | 'APPROVE' | 'CREATE' = 'VIEW', key = module): Promise<any | null> {
  const s: Scope | undefined = can(req.user, module, action)
  if (!s) return null
  const ids = await scopeIds(req.user, s)
  return ids && SCOPES[key] ? SCOPES[key](ids) : {}
}

export const render = (text: string, vars: Record<string, string | number | null | undefined>) => text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => String(vars[k] ?? ''))
export const inr = (n: number) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })
