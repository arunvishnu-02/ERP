'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { EntryFrame } from '@/components/entry'
import { Button, Field, Input } from '@/components/ui'
import { api, ApiError } from '@/lib/api'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api('/auth/status').then((s) => (s.needsSetup ? router.replace('/setup') : api('/auth/me').then(() => router.replace('/dashboard'), () => {}))).catch((e) => setError(e instanceof ApiError ? e.message : 'The server is not reachable. Try again in a moment.'))
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
        <p className="text-xs text-muted">Forgot your password? Ask a Super Admin to reset it under Settings, Users.</p>
      </form>
    </EntryFrame>
  )
}
