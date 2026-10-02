'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { EntryFrame } from '@/components/entry'
import { Button, Field, Input, Select } from '@/components/ui'
import { api, ApiError, setToken } from '@/lib/api'

export default function SetupPage() {
  const router = useRouter()
  const [states, setStates] = useState<{ code: string; name: string }[]>([])
  const [v, setV] = useState({ companyName: '', stateCode: '', gstin: '', firstName: '', lastName: '', email: '', password: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { api('/auth/status').then((s) => (s.needsSetup ? setStates(s.states) : router.replace('/login'))).catch(() => setError('The server is not reachable. Try again in a moment.')) }, [router])
  const bind = (k: keyof typeof v) => ({ value: v[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value })) })
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setErrors({})
    try {
      setToken((await api('/auth/setup', { body: v })).accessToken)
      router.replace('/dashboard')
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(Object.fromEntries(err.errors.map((x) => [x.field, x.message])))
      setError((err as Error).message)
      setBusy(false)
    }
  }
  return (
    <EntryFrame title="Set up your company" intro="This runs once. It creates your company and the first Super Admin. You can change everything later under Settings.">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Company name" error={errors.companyName} className="sm:col-span-2"><Input {...bind('companyName')} required autoFocus /></Field>
        <Field label="State of GST registration" error={errors.stateCode}>
          <Select {...bind('stateCode')} required><option value="">Select…</option>{states.filter((s) => s.code !== '99').map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</Select>
        </Field>
        <Field label="GSTIN (optional)" error={errors.gstin}><Input {...bind('gstin')} /></Field>
        <Field label="Your first name" error={errors.firstName}><Input {...bind('firstName')} required /></Field>
        <Field label="Last name" error={errors.lastName}><Input {...bind('lastName')} /></Field>
        <Field label="Your email" error={errors.email} className="sm:col-span-2"><Input type="email" autoComplete="username" {...bind('email')} required /></Field>
        <Field label="Password, at least 8 characters" error={errors.password} className="sm:col-span-2"><Input type="password" autoComplete="new-password" minLength={8} {...bind('password')} required /></Field>
        {error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad sm:col-span-2">{error}</p>}
        <Button type="submit" variant="primary" loading={busy} className="sm:col-span-2">Create company and sign in</Button>
      </form>
    </EntryFrame>
  )
}
