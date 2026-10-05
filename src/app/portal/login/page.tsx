'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Brand } from '@/components/portal'
import { Button, Card, Field, Input } from '@/components/ui'
import { api, useApi } from '@/lib/api'

/** Clients sign in with their email and a 6-digit code. There is no password to remember. */
export default function PortalLogin() {
  const router = useRouter()
  const brand = useApi<{ name: string; logo: string | null }>('/portal/auth/brand').data
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function run(fn: () => Promise<void>) {
    setBusy(true); setError('')
    try { await fn() } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  const sendCode = (e?: React.FormEvent) => { e?.preventDefault(); return run(async () => { await api('/portal/auth/code', { body: { email } }); setStep('code') }) }
  const verify = (e: React.FormEvent) => { e.preventDefault(); return run(async () => { await api('/portal/auth/verify', { body: { email, code } }); router.replace('/portal') }) }
  const alert = error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>
  return (
    <main className="grid min-h-screen place-items-center bg-surface-2 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">{brand && <Brand name={brand.name} logo={brand.logo} />}</div>
        <Card className="p-6 shadow-sm">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{step === 'email' ? 'Client portal' : 'Enter the code'}</h1>
          <p className="mt-1 mb-5 text-sm text-muted">{step === 'email' ? 'See your quotations, invoices, projects and support tickets. Enter your email and we will send you a 6-digit code.' : `If ${email} has portal access, a 6-digit code is on its way. It works for 15 minutes.`}</p>
          {step === 'email' ? (
            <form onSubmit={sendCode} className="space-y-4">
              <Field label="Your email"><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
              {alert}
              <Button type="submit" variant="primary" loading={busy} className="w-full">Send code</Button>
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-4">
              <Field label="Code from the email"><Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="num tracking-[0.4em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus /></Field>
              {alert}
              <Button type="submit" variant="primary" loading={busy} className="w-full">Sign in</Button>
              <p className="text-sm text-muted">No email? Check spam, <button type="button" className="text-accent hover:underline" disabled={busy} onClick={() => sendCode()}>send a new code</button>, or <button type="button" className="text-accent hover:underline" onClick={() => { setStep('email'); setCode(''); setError('') }}>use another email</button>.</p>
            </form>
          )}
        </Card>
        <p className="mt-4 text-center text-xs text-muted">No access yet? Ask your contact at {brand?.name || 'our team'} to switch on the client portal for you.</p>
      </div>
    </main>
  )
}
