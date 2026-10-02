'use client'

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <h1 className="font-display text-2xl font-semibold">This page could not be shown</h1>
        <p className="mt-2 text-sm text-muted">Your data is safe. Try again, and if it keeps happening tell your administrator.</p>
        <button onClick={reset} className="mt-5 inline-flex h-9 items-center rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-ink">Try again</button>
      </div>
    </main>
  )
}
