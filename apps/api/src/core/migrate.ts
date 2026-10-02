import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { env } from '../env.js'

/** Applies the .sql files in migrations/ that have not run yet, in name order. */
export async function migrate() {
  const client = new pg.Client({ connectionString: env.databaseUrl })
  await client.connect()
  try {
    await client.query('SELECT pg_advisory_lock(727274)')
    await client.query('CREATE TABLE IF NOT EXISTS "_cx_migrations" (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())')
    const done = new Set((await client.query('SELECT name FROM "_cx_migrations"')).rows.map((r) => r.name))
    const files = fs.readdirSync(env.migrationsDir).filter((f) => f.endsWith('.sql')).sort()
    for (const f of files) {
      if (done.has(f)) continue
      const sql = fs.readFileSync(path.join(env.migrationsDir, f), 'utf8')
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO "_cx_migrations" (name) VALUES ($1)', [f])
        await client.query('COMMIT')
        console.log(`Applied migration ${f}`)
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => {})
    await client.end()
  }
}
