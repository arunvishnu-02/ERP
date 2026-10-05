'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { Button, cn, Dialog, Field as FieldWrap, Input, Select, Textarea } from './ui'

export interface Opt { value: string; label: string }
export interface Field {
  name: string
  label: string
  type?: 'text' | 'email' | 'password' | 'number' | 'date' | 'month' | 'datetime-local' | 'textarea' | 'select' | 'checkbox' | 'multi' | 'file'
  options?: Opt[]
  required?: boolean
  full?: boolean
  help?: string
  placeholder?: string
  show?: (values: any) => boolean
}

export function FieldInput({ f, value, onChange }: { f: Field; value: any; onChange: (v: any) => void }) {
  if (f.type === 'select') {
    return (
      <Select value={value ?? ''} onChange={(e) => onChange(e.target.value)} required={f.required}>
        {!f.required || !value ? <option value="">{f.placeholder ?? 'Select…'}</option> : null}
        {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    )
  }
  if (f.type === 'textarea') return <Textarea value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} required={f.required} />
  if (f.type === 'checkbox') {
    return (
      <span className="flex h-9 items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        {f.placeholder ?? 'Yes'}
      </span>
    )
  }
  if (f.type === 'multi') {
    const cur: string[] = Array.isArray(value) ? value : []
    return (
      <span className="flex flex-wrap gap-1.5">
        {f.options?.map((o) => {
          const on = cur.includes(o.value)
          return (
            <button key={o.value} type="button" aria-pressed={on} onClick={() => onChange(on ? cur.filter((v) => v !== o.value) : [...cur, o.value])} className={cn('rounded-full border px-2.5 py-1 text-[13px]', on ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface text-muted hover:text-ink')}>
              {o.label}
            </button>
          )
        })}
      </span>
    )
  }
  if (f.type === 'file') return <input type="file" required={f.required} onChange={(e) => onChange(e.target.files?.[0] ?? null)} className="text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm" />
  return <Input type={f.type ?? 'text'} step={f.type === 'number' ? 'any' : undefined} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} required={f.required} />
}

interface FormDialogProps {
  open: boolean
  onClose: () => void
  title: string
  fields: Field[]
  initial?: Record<string, any>
  onSubmit: (values: Record<string, any>) => Promise<unknown>
  submitLabel?: string
  intro?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  extra?: React.ReactNode
}
/** A dialog with a form built from a list of fields. Server validation messages appear under the matching field. */
export function FormDialog({ open, onClose, title, fields, initial, onSubmit, submitLabel = 'Save', intro, size = 'md', extra }: FormDialogProps) {
  const [values, setValues] = useState<Record<string, any>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) { setValues(initial ?? {}); setErrors({}) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    e.stopPropagation()
    setBusy(true)
    setErrors({})
    try {
      const body: Record<string, any> = {}
      for (const f of fields) {
        if (f.show && !f.show(values)) continue
        const v = values[f.name]
        body[f.name] = f.type === 'number' ? (v === '' || v === undefined || v === null ? '' : Number(v)) : f.type === 'checkbox' ? !!v : f.type === 'multi' ? v ?? [] : v ?? ''
      }
      await onSubmit(body)
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.errors?.length) setErrors(Object.fromEntries(err.errors.map((x) => [x.field, x.message])))
      toast.error(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={title} size={size} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="form-dialog" loading={busy}>{submitLabel}</Button></>}>
      <form id="form-dialog" onSubmit={submit} className="space-y-4">
        {intro}
        <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
          {fields.filter((f) => !f.show || f.show(values)).map((f) => (
            <FieldWrap key={f.name} label={f.label} group={f.type === 'multi'} error={errors[f.name]} help={f.help} className={cn((f.full || f.type === 'textarea' || f.type === 'multi') && 'sm:col-span-2')}>
              <FieldInput f={f} value={values[f.name]} onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))} />
            </FieldWrap>
          ))}
        </div>
        {extra}
      </form>
    </Dialog>
  )
}

/** Ask before a change that cannot be undone. */
export function ConfirmDialog({ open, onClose, title, children, confirmLabel, onConfirm, danger }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; confirmLabel: string; onConfirm: () => Promise<unknown>; danger?: boolean }) {
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    try { await onConfirm(); onClose() } catch (e) { toast.error(e instanceof Error ? e.message : 'That did not work') } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onClose={onClose} title={title} size="sm" footer={<><Button onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={go}>{confirmLabel}</Button></>}>
      <div className="text-sm text-muted">{children}</div>
    </Dialog>
  )
}

/** A form shown on the page itself, for settings that are edited in place. */
export function InlineForm({ fields, initial, onSubmit, submitLabel = 'Save changes', extra }: { fields: Field[]; initial: Record<string, any>; onSubmit: (values: Record<string, any>) => Promise<unknown>; submitLabel?: string; extra?: React.ReactNode }) {
  const [values, setValues] = useState<Record<string, any>>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    try {
      const body: Record<string, any> = {}
      for (const f of fields) {
        if (f.show && !f.show(values)) continue
        const v = values[f.name]
        body[f.name] = f.type === 'number' ? (v === '' || v === undefined || v === null ? '' : Number(v)) : f.type === 'checkbox' ? !!v : f.type === 'multi' ? v ?? [] : v ?? ''
      }
      await onSubmit(body)
    } catch (err) {
      if (err instanceof ApiError && err.errors?.length) setErrors(Object.fromEntries(err.errors.map((x) => [x.field, x.message])))
      toast.error(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
        {fields.filter((f) => !f.show || f.show(values)).map((f) => (
          <FieldWrap key={f.name} label={f.label} group={f.type === 'multi'} error={errors[f.name]} help={f.help} className={cn((f.full || f.type === 'textarea' || f.type === 'multi') && 'sm:col-span-2')}>
            <FieldInput f={f} value={values[f.name]} onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))} />
          </FieldWrap>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2"><Button variant="primary" type="submit" loading={busy}>{submitLabel}</Button>{extra}</div>
    </form>
  )
}
