'use client'
// A searchable tick list of people, used to pick a Team Leader's team and a project's members.
import { Search } from 'lucide-react'
import { useState } from 'react'
import { cn, Input } from './ui'

export interface PersonOpt { id: string; name: string; hint?: string | null; tag?: string | null }

export function PeoplePicker({ people, value, onChange, empty = 'No one to choose yet.', disabled }: { people: PersonOpt[]; value: string[]; onChange: (ids: string[]) => void; empty?: string; disabled?: boolean }) {
  const [q, setQ] = useState('')
  const shown = people.filter((p) => !q || `${p.name} ${p.hint ?? ''} ${p.tag ?? ''}`.toLowerCase().includes(q.toLowerCase()))
  const all = shown.length > 0 && shown.every((p) => value.includes(p.id))
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  if (!people.length) return <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-[13px] text-muted">{empty}</p>
  return (
    <div className="rounded-xl border border-line">
      <div className="flex items-center gap-2 border-b border-line px-2 py-1.5">
        <Search size={15} className="shrink-0 text-muted" />
        <Input aria-label="Search people" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or designation" className="h-8 border-0 bg-transparent px-1 shadow-none focus:ring-0" />
        {!disabled && shown.length > 1 && (
          <button type="button" className="shrink-0 text-xs font-medium text-accent-strong hover:underline" onClick={() => onChange(all ? value.filter((id) => !shown.some((p) => p.id === id)) : [...new Set([...value, ...shown.map((p) => p.id)])])}>
            {all ? 'Clear' : 'Select all'}
          </button>
        )}
      </div>
      <ul className="max-h-56 overflow-y-auto py-1">
        {shown.map((p) => {
          const on = value.includes(p.id)
          return (
            <li key={p.id}>
              <label className={cn('flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-surface-2', disabled && 'cursor-default opacity-70')}>
                <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={on} disabled={disabled} onChange={() => toggle(p.id)} />
                <span className="min-w-0 flex-1 truncate">{p.name}{p.hint ? <span className="ml-1.5 text-xs text-muted">{p.hint}</span> : null}</span>
                {p.tag ? <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">{p.tag}</span> : null}
              </label>
            </li>
          )
        })}
        {!shown.length && <li className="px-3 py-3 text-center text-[13px] text-muted">No one matches “{q}”.</li>}
      </ul>
      <p className="border-t border-line px-3 py-1.5 text-xs text-muted">{value.filter((id) => people.some((p) => p.id === id)).length} chosen</p>
    </div>
  )
}
