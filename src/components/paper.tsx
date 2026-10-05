'use client'
// The company's house style for every printed document: a white A4 page with a navy and cyan stripe on the left,
// the logo at the top and a contact footer at the bottom. Quotations, invoices, receipts and HR letters all use it.
import { Globe, Mail, MapPin, Phone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from './ui'

/** The company address on one line. */
export const orgAddress = (org: any) => [org.addressLine1, org.addressLine2, org.city, org.state, org.pincode].filter(Boolean).join(', ')

/** A white page with the stripe on the left and the contact footer at the bottom. */
export function Paper({ org, children, className, dense }: { org: any; children: React.ReactNode; className?: string; dense?: boolean }) {
  return (
    <article className={cn('paper relative flex flex-col overflow-hidden rounded-xl border border-line shadow-sm', className)}>
      <span aria-hidden className="absolute inset-y-0 left-0 w-3 bg-[var(--doc-navy)]" />
      <span aria-hidden className="absolute top-36 left-0 h-24 w-3 bg-[var(--doc-cyan)]" />
      <span aria-hidden className="absolute top-60 left-0 h-12 w-3 bg-[var(--doc-soft)]" />
      <div className={cn('flex flex-1 flex-col py-8 pr-6 pl-9 sm:pr-11 sm:pl-14', dense ? 'gap-3.5 sm:py-6' : 'gap-6 sm:py-10')}>{children}</div>
      <ContactFooter org={org} />
    </article>
  )
}

/** Logo (or the company name) on the left and the document title on the right. */
export function PaperHeader({ org, title, children }: { org: any; title: string; children?: React.ReactNode }) {
  const s = org.settings ?? {}
  return (
    <header className="flex flex-wrap items-start justify-between gap-5">
      <div className="min-w-0">
        {s.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.logo} alt={org.name} className="h-11 max-w-[300px] object-contain object-left" />
        ) : (
          <div className="text-xl leading-tight font-bold text-[var(--doc-navy)]">{org.name}</div>
        )}
        {s.tagline && !s.logo && <div className="mt-0.5 text-[11px] font-medium text-[var(--doc-cyan)]">{s.tagline}</div>}
      </div>
      <div className="text-right">
        <div className={cn('leading-none font-bold tracking-wide text-[var(--doc-navy)]', title.length > 18 ? 'text-[20px] sm:text-[22px]' : 'text-[26px] sm:text-[30px]')}>{title}</div>
        <div className="mt-1.5 text-[11px] text-[var(--doc-muted)]">{org.legalName || org.name}</div>
        {children}
      </div>
    </header>
  )
}

/** Small grey label above a value, as used across the document. */
export const Label = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('text-[10px] font-semibold tracking-wider text-[var(--doc-cyan)] uppercase', className)}>{children}</div>
)

/** A pale band of label and value pairs, for numbers and dates. */
export function InfoStrip({ items }: { items: [string, React.ReactNode][] }) {
  const shown = items.filter(([, v]) => v !== undefined && v !== null && v !== '')
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg bg-[var(--doc-tint)] px-5 py-3.5 sm:grid-cols-4">
      {shown.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <div className="text-[9.5px] font-medium tracking-wider text-[var(--doc-muted)] uppercase">{k}</div>
          <div className="mt-0.5 text-[13px] font-semibold break-words">{v}</div>
        </div>
      ))}
    </div>
  )
}

/** Signature lines: the customer's on the left when asked for, the company's on the right. */
export function Signatures({ org, client }: { org: any; client?: string }) {
  const s = org.settings ?? {}
  return (
    <div className="mt-auto flex items-end justify-between gap-8 pt-6 text-[11.5px]">
      {client ? <div className="w-44 border-t border-[var(--doc-muted)] pt-1.5 text-[var(--doc-muted)]">{client}</div> : <span />}
      <div className="text-right">
        <div className="mb-9 font-semibold">For {org.legalName || org.name}</div>
        <div className="ml-auto w-44 border-t border-[var(--doc-muted)] pt-1.5 text-[var(--doc-muted)]">{s.signatory ? `${s.signatory}, ` : ''}Authorised signatory</div>
      </div>
    </div>
  )
}

/** Navy and cyan bar with the company's phone, email, website and office. */
export function ContactFooter({ org }: { org: any }) {
  const s = org.settings ?? {}
  const cols: [string, string | undefined, typeof Phone][] = [['Phone', org.phone, Phone], ['Email', org.email, Mail], ['Web', s.website, Globe], ['Office', orgAddress(org), MapPin]]
  const shown = cols.filter(([, v]) => v)
  if (!shown.length) return null
  return (
    <footer className="pr-6 pb-7 pl-9 sm:pr-11 sm:pl-14">
      <div className="mb-3 flex h-1 overflow-hidden rounded-full"><span className="w-1/4 bg-[var(--doc-navy)]" /><span className="w-1/6 bg-[var(--doc-cyan)]" /><span className="flex-1 bg-[var(--doc-soft)]" /></div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        {shown.map(([k, v, Icon]) => (
          <div key={k} className={cn('flex min-w-0 items-start gap-2', k === 'Office' && 'col-span-2 sm:col-span-1')}>
            <span aria-hidden className="mt-px grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-[var(--doc-navy)] text-white"><Icon size={11} strokeWidth={2.2} /></span>
            <div className="min-w-0">
              <div className="text-[9px] font-semibold tracking-wider text-[var(--doc-cyan)] uppercase">{k}</div>
              <div className="text-[10.5px] leading-snug break-words">{v}</div>
            </div>
          </div>
        ))}
      </div>
    </footer>
  )
}

/** A UPI QR code that opens any UPI app with the amount filled in. */
export function UpiQr({ upiId, name, amount, note, size = 116 }: { upiId: string; name: string; amount?: number; note?: string; size?: number }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    const p = new URLSearchParams({ pa: upiId, pn: name, cu: 'INR' })
    if (amount && amount > 0) p.set('am', amount.toFixed(2))
    if (note) p.set('tn', note.slice(0, 60))
    let live = true
    import('qrcode').then((Q) => Q.toString(`upi://pay?${p.toString()}`, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#0e0b33', light: '#ffffff' } })).then((s) => live && setSvg(s)).catch(() => {})
    return () => { live = false }
  }, [upiId, name, amount, note])
  return <div role="img" aria-label={`UPI QR code for ${upiId}`} className="shrink-0 rounded-md bg-white p-1.5 ring-1 ring-[var(--doc-line)]" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />
}
