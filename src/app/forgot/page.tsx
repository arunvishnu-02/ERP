'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { EntryFrame } from '@/components/entry'
import { Button, Field, Input } from '@/components/ui'
import { api } from '@/lib/api'

/** Two steps: ask for a code by email, then type the code and a new password. */
export default function ForgotPage() {
  const router = useRouter()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError('')
    try { await fn() } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  const sendCode = (e?: React.FormEvent) => { e?.preventDefault(); return run(async () => { await api('/auth/forgot', { body: { email } }); setStep('code') }) }
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== again) return setError('The two passwords are not the same')
    return run(async () => { await api('/auth/reset', { body: { email, code, password } }); router.replace('/dashboard') })
  }
  const back = <p className="text-sm"><Link href="/login" className="text-accent hover:underline">Back to sign in</Link></p>
  const alert = error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>
  if (step === 'email') return (
    <EntryFrame title="Forgot your password?" intro="Enter your work email. We will send you a 6-digit code.">
      <form onSubmit={sendCode} className="space-y-4">
        <Field label="Work email"><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
        {alert}
        <Button type="submit" variant="primary" loading={busy} className="w-full">Send code</Button>
        {back}
        <p className="text-xs text-muted">Still stuck? Ask your admin to reset it from Settings, Users.</p>
      </form>
    </EntryFrame>
  )
  return (
    <EntryFrame title="Enter the code" intro={`If ${email} has an account, a 6-digit code is on its way. It works for 15 minutes.`}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Code from the email"><Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="num tracking-[0.4em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus /></Field>
        <Field label="New password, at least 8 characters"><Input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        <Field label="Type it again"><Input type="password" autoComplete="new-password" minLength={8} value={again} onChange={(e) => setAgain(e.target.value)} required /></Field>
        {alert}
        <Button type="submit" variant="primary" loading={busy} className="w-full">Save new password</Button>
        <p className="text-sm text-muted">No email? Check spam, or <button type="button" className="text-accent hover:underline" disabled={busy} onClick={() => sendCode()}>send a new code</button>.</p>
        {back}
      </form>
    </EntryFrame>
  )
}
