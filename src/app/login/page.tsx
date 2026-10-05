'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { EntryFrame } from '@/components/entry'
import { Button, Field, Input } from '@/components/ui'
import { api, ApiError } from '@/lib/api'

const GOOGLE_LOGIN: Record<string, string> = {
  nouser: 'That Google account has no user here. Ask your administrator to add you with the same email.',
  domain: 'Use your company Google account.',
  unverified: 'That Google account has no verified email.',
  cancelled: 'Google sign-in was cancelled.',
  expired: 'That took too long. Try again.',
  off: 'Sign in with Google is turned off. Use your email and password.',
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [google, setGoogle] = useState(false)
  useEffect(() => {
    const back = new URLSearchParams(window.location.search).get('google')
    if (back) { setError(GOOGLE_LOGIN[back] ?? 'Google sign-in did not work. Try again or use your password.'); window.history.replaceState(null, '', '/login') }
    api('/auth/status').then((s) => { setGoogle(!!s.google); return s }).then((s) => (s.needsSetup ? router.replace('/setup') : api('/auth/me').then(() => router.replace('/dashboard'), () => {}))).catch((e) => setError(e instanceof ApiError ? e.message : 'The server is not reachable. Try again in a moment.'))
  }, [router])
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/auth/login', { body: { email, password } })
      router.replace('/dashboard')
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }
  return (
    <EntryFrame title="Sign in" intro="Use the email and password your administrator gave you.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email"><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
        <Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        {error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
        <Button type="submit" variant="primary" loading={busy} className="w-full">Sign in</Button>
        {google && (
          <>
            <div className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
            <a href="/api/v1/auth/google" className="flex h-10 w-full items-center justify-center gap-2.5 rounded-lg border border-line bg-surface text-sm font-medium hover:bg-surface-2">
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" /><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" /><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" /></svg>
              Sign in with Google
            </a>
          </>
        )}
        <p className="text-sm"><Link href="/forgot" className="text-accent hover:underline">Forgot password?</Link></p>
      </form>
    </EntryFrame>
  )
}
