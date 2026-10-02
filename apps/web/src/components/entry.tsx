'use client'
import { Check, LockKeyhole } from 'lucide-react'
import { STEPS } from './misc'

/** The frame around the sign-in and first-run setup forms. The left side shows the path every deal follows. */
export function EntryFrame({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden flex-col justify-between bg-rail p-10 text-rail-ink lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-accent-ink"><LockKeyhole size={19} /></span>
          <span className="font-display text-lg font-semibold text-white">CX CRM ERP</span>
        </div>
        <div>
          <p className="max-w-sm font-display text-3xl leading-tight font-semibold text-white">One path for every deal, from the first enquiry to the last payment.</p>
          <ol className="mt-8 space-y-0">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-3 text-[15px]">
                <span className="flex flex-col items-center">
                  <span className="num grid h-6 w-6 place-items-center rounded-full border border-rail-mute/50 text-[11px] text-rail-ink">{i === STEPS.length - 1 ? <Check size={12} /> : i + 1}</span>
                  {i < STEPS.length - 1 && <span className="h-4 w-px bg-rail-mute/40" />}
                </span>
                <span className={i < STEPS.length - 1 ? '-mt-4' : ''}>{s}</span>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-xs text-rail-mute">Leads, quotations, projects, invoices, payments, marketing, websites, HR and finance in one place.</p>
      </aside>
      <main className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-ink"><LockKeyhole size={17} /></span>
            <span className="font-display text-base font-semibold">CX CRM ERP</span>
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 mb-6 text-sm text-muted">{intro}</p>
          {children}
        </div>
      </main>
    </div>
  )
}
