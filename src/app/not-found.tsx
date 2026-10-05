import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <h1 className="font-display text-2xl font-semibold">This page does not exist</h1>
        <p className="mt-2 text-sm text-muted">The address may be mistyped, or the page was moved.</p>
        <Link href="/dashboard" className="mt-5 inline-flex h-9 items-center rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-ink">Go to the dashboard</Link>
      </div>
    </main>
  )
}
