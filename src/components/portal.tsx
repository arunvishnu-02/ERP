'use client'
// Shared pieces for the client portal pages.
import { createContext, useContext } from 'react'
import { inr } from '@/lib/format'

export interface PortalMe {
  contact: { id: string; firstName: string; lastName: string | null; email: string | null }
  customer: { name: string }
  organization: { name: string; email: string | null; phone: string | null; logo: string | null; tagline: string | null }
}
export const PortalCtx = createContext<PortalMe | null>(null)
export const usePortal = () => useContext(PortalCtx)!

/** The company's logo, or its name when no logo is uploaded. */
export function Brand({ name, logo, light }: { name: string; logo: string | null; light?: boolean }) {
  return logo
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={logo} alt={name} className="h-9 max-w-[200px] object-contain object-left" />
    : <span className={`font-display text-lg font-semibold ${light ? 'text-white' : ''}`}>{name}</span>
}

export function PageTitle({ title, intro }: { title: string; intro?: string }) {
  return <div className="mb-4"><h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>{intro && <p className="mt-1 text-sm text-muted">{intro}</p>}</div>
}

export const money = (n: number | string) => inr(Number(n))
