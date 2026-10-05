// Runs once when the server starts: brings the database up to date and starts the daily checks.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build') return
  const { ready } = await import('./server/app')
  const { startScheduler } = await import('./server/core/jobs')
  ready()
    .then(startScheduler)
    // Not fatal: the first API request tries again and reports the reason to the person using the app.
    .catch((e) => console.error('The database is not ready:', e instanceof Error ? e.message : e))
}
