export const inr = (n?: number | null, decimals = false) =>
  n === null || n === undefined ? '' : (n < 0 ? '-' : '') + '₹' + Math.abs(Number(n)).toLocaleString('en-IN', { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: 2 })
export const inrShort = (n: number) => {
  const a = Math.abs(n)
  return a >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : a >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : inr(Math.round(n))
}
export const day = (s?: string | null) => (s ? s.slice(0, 10) : '')
const parseDay = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00`)
export const fmtDate = (s?: string | null) => (s ? parseDay(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '')
export const fmtShort = (s?: string | null) => (s ? parseDay(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '')
export const fmtDateTime = (s?: string | null) => (s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '')
export const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
export const plusDays = (n: number, from = todayStr()) => new Date(Date.parse(`${from}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
export const daysFromToday = (iso: string) => Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${todayStr()}T00:00:00Z`)) / 864e5)
export const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
export const ago = (s: string) => {
  const m = Math.round((Date.now() - Date.parse(s)) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`
  return m < 60 * 24 * 14 ? `${Math.round(m / 1440)} d ago` : fmtDate(s)
}

const WORDS: Record<string, string> = {
  SEO: 'SEO', UPI: 'UPI', SSL: 'SSL', FTP: 'FTP', CPANEL: 'cPanel', CMS_ADMIN: 'CMS admin', UI_UX_DESIGN: 'UI/UX design', X: 'X (Twitter)', IT_SERVICES: 'IT services',
  HOSTING_DOMAIN: 'Hosting and domain', PARTIALLY_PAID: 'Partly paid', TODO: 'To do', META_ADS: 'Meta Ads', GOOGLE_ADS: 'Google Ads', GOOGLE_BUSINESS: 'Google Business',
  LINKEDIN: 'LinkedIn', YOUTUBE: 'YouTube', WHATSAPP: 'WhatsApp', IN_APP: 'In app', SMS: 'SMS', NOTE_ADDED: 'Note', WHATSAPP_SENT: 'WhatsApp', EMAIL_SENT: 'Email', HR_FILE: 'HR file',
}
/** Turns a stored code such as IN_PROGRESS into "In progress". */
export const human = (s?: string | null) => (!s ? '' : WORDS[s] ?? (s[0] + s.slice(1).toLowerCase()).replace(/_/g, ' '))
export const options = (values: readonly string[] = []) => values.map((value) => ({ value, label: human(value) }))
export const personName = (u?: { firstName?: string; lastName?: string | null } | null) => (u ? [u.firstName, u.lastName].filter(Boolean).join(' ') : '')
export const leadLabel = (l?: { firstName?: string; lastName?: string | null; companyName?: string | null } | null) => (l ? l.companyName || personName(l) : '')
export const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'accent' | 'mute'
const TONES: Record<Tone, string[]> = {
  good: ['PAID', 'ACCEPTED', 'CONVERTED', 'WON', 'DONE', 'COMPLETED', 'ACTIVE', 'APPROVED', 'RESOLVED', 'PUBLISHED', 'LIVE', 'PRESENT', 'AVAILABLE', 'RECEIVED', 'DELIVERED', 'READ', 'SUCCEEDED', 'SIGNED', 'RENEWED', 'ISSUED', 'ACKNOWLEDGED'],
  warn: ['PENDING_APPROVAL', 'PARTIALLY_PAID', 'PENDING', 'IN_REVIEW', 'ON_HOLD', 'WAITING_ON_CUSTOMER', 'CLIENT_REVIEW', 'INTERNAL_REVIEW', 'DUE_SOON', 'SUBMITTED', 'ON_LEAVE', 'HALF_DAY', 'IN_REPAIR', 'ON_NOTICE', 'HIGH', 'PAUSED', 'MAINTENANCE', 'SUSPENDED', 'INVITED'],
  bad: ['OVERDUE', 'REJECTED', 'LOST', 'DECLINED', 'EXPIRED', 'FAILED', 'ABSENT', 'URGENT', 'BLOCKED', 'DOWN', 'VOID', 'CANCELLED', 'MISSED', 'JUNK', 'DEACTIVATED', 'CHURNED'],
  info: ['SENT', 'OPEN', 'IN_PROGRESS', 'PLANNED', 'IN_DESIGN', 'IN_EDIT', 'WORK_FROM_HOME', 'ASSIGNED', 'MEDIUM', 'IN_DEVELOPMENT', 'QUEUED', 'RUNNING', 'PLANNING'],
  accent: ['VIEWED', 'SCHEDULED', 'APPLIED'],
  mute: [],
}
export const toneOf = (status?: string | null): Tone => (Object.keys(TONES) as Tone[]).find((t) => TONES[t].includes(status ?? '')) ?? 'mute'

export function waLink(phone: string | null | undefined, text: string) {
  let digits = String(phone ?? '').replace(/\D/g, '')
  if (digits.length === 10) digits = '91' + digits
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

export interface Line { serviceId?: string | null; milestoneId?: string | null; description: string; sacCode?: string | null; quantity: number | string; unit?: string | null; unitPrice: number | string; discountPercent?: number | string | null; taxRate?: number | string | null }
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
/** The same GST arithmetic the server uses, for the live total while a document is being edited. */
export function computeDoc(lines: Line[], o: { interState: boolean; exportSale: boolean; noGst?: boolean }) {
  const t = { subtotal: 0, discount: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 }
  for (const l of lines) {
    const gross = r2(Number(l.quantity || 0) * Number(l.unitPrice || 0))
    const discount = r2((gross * Number(l.discountPercent || 0)) / 100)
    const taxable = r2(gross - discount)
    const tax = o.exportSale || o.noGst ? 0 : r2((taxable * Number(l.taxRate ?? 18)) / 100)
    const cgst = o.interState ? 0 : r2(tax / 2)
    t.subtotal += gross; t.discount += discount; t.taxable += taxable
    t.cgst += cgst; t.sgst += o.interState ? 0 : r2(tax - cgst); t.igst += o.interState ? tax : 0
  }
  t.total = r2(t.taxable + t.cgst + t.sgst + t.igst)
  return t
}

export function amountInWords(n: number) {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  const two = (x: number) => (x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : ''))
  const three = (x: number) => (x >= 100 ? a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' : '') : '') + (x % 100 ? two(x % 100) : '')
  const rupees = Math.floor(n)
  const paise = Math.round((n - rupees) * 100)
  let r = rupees
  const parts: string[] = []
  const crore = Math.floor(r / 1e7); r %= 1e7
  const lakh = Math.floor(r / 1e5); r %= 1e5
  const thousand = Math.floor(r / 1e3); r %= 1e3
  if (crore) parts.push(three(crore) + ' Crore')
  if (lakh) parts.push(two(lakh) + ' Lakh')
  if (thousand) parts.push(two(thousand) + ' Thousand')
  if (r) parts.push(three(r))
  return `Rupees ${parts.join(' ') || 'Zero'}${paise ? ` and ${two(paise)} Paise` : ''} only`
}

/** True when the company has switched GST off in Settings: no GST columns, rates or totals anywhere. */
export const gstOff = (org: any) => org?.settings?.gstRegistered === false
