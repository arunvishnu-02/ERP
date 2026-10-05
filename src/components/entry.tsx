'use client'
import { Check } from 'lucide-react'
import { STEPS } from './misc'

const Mark = ({ big }: { big?: boolean }) => (
  <span className={big ? 'grid h-10 w-10 place-items-center rounded-[10px] bg-gradient-to-br from-[#02a6dc] to-[#3b6bff] text-sm font-semibold text-[#08043a]' : 'grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#02a6dc] to-[#3b6bff] text-[13px] font-semibold text-[#08043a]'}>CX</span>
)

/** The frame around the sign-in and first-run setup forms. The left side shows the path every deal follows. */
export function EntryFrame({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[600px_minmax(0,1fr)]">
      <aside className="app-rail hidden flex-col justify-between p-14 text-rail-ink lg:flex">
        <div className="flex items-center gap-3">
          <Mark big />
          <span><span className="block text-base leading-5 font-semibold text-white">CX CRM ERP</span><span className="block text-[13px] text-rail-mute">Cipher Mutex</span></span>
        </div>
        <div>
          <p className="max-w-md font-display text-[32px] leading-[1.2] font-semibold tracking-tight text-white">From the first call to the final payment</p>
          <p className="mt-4 max-w-md text-sm text-rail-mute">Leads, quotations, projects, invoices and payments for the whole team, in one place.</p>
          <ol className="mt-8 flex max-w-[480px] items-start">
            {STEPS.map((s, i) => (
              <li key={s} className="relative flex flex-1 flex-col items-center gap-2 text-center text-[11px] text-rail-ink">
                {i > 0 && <span className="absolute top-3 right-1/2 h-px w-full bg-[#3cc2ef]/60" />}
                <span className="relative grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-[#3cc2ef] to-[#3b6bff] text-[#08043a]"><Check size={13} strokeWidth={2.5} /></span>
                <span className="whitespace-nowrap">{s === 'Completion' ? 'Done' : s}</span>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-xs text-rail-mute">For Cipher Mutex staff only</p>
      </aside>
      <main className="flex items-center justify-center bg-bg px-5 py-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Mark />
            <span className="font-display text-base font-semibold">CX CRM ERP</span>
          </div>
          <h1 className="font-display text-[32px] leading-10 font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 mb-7 text-sm text-muted">{intro}</p>
          {children}
        </div>
      </main>
    </div>
  )
}
