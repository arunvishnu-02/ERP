import crypto from 'node:crypto'
import { Client } from 'pg'
import { dbUrl } from '../env'
import { MIGRATIONS } from '../migrations.generated'

// PostgreSQL error codes that mean "this step was already done", accepted only when finishing a migration that stopped half way.
const ALREADY_DONE = new Set(['42P07', '42710', '42701', '42P16', '42P06'])
// Any number will do: it only has to be the same in every copy of the app.
const LOCK_KEY = 8_164_221_300_045_101n

/** One statement per ";" at the end of a line. Comment lines are dropped. */
const statements = (sql: string) =>
  sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(/;\s*(?:\r?\n|$)/).map((s) => s.trim()).filter(Boolean)

/**
 * Applies the Prisma migrations that have not run yet, in name order, and records them in
 * _prisma_migrations in the same format `prisma migrate deploy` uses. So either tool can be used.
 * The SQL is compiled into the app (see scripts/embed-migrations.mjs), so nothing is read from disk.
 */
export async function migrate() {
  const conn = new Client({ connectionString: dbUrl(), connectionTimeoutMillis: 10_000 })
  await conn.connect()
  let locked = false
  try {
    const { rows: lock } = await conn.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [String(LOCK_KEY)])
    locked = !!lock[0]?.locked
    if (!locked) throw new Error('Another process is updating the database')
    await conn.query(
      'CREATE TABLE IF NOT EXISTS "_prisma_migrations" ("id" VARCHAR(36) NOT NULL, "checksum" VARCHAR(64) NOT NULL, "finished_at" TIMESTAMPTZ, "migration_name" VARCHAR(255) NOT NULL, "logs" TEXT, "rolled_back_at" TIMESTAMPTZ, "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "applied_steps_count" INTEGER NOT NULL DEFAULT 0, PRIMARY KEY ("id"))',
    )
    const { rows } = await conn.query<{ id: string; migration_name: string; finished_at: Date | null }>('SELECT "id", "migration_name", "finished_at" FROM "_prisma_migrations" WHERE "rolled_back_at" IS NULL')
    for (const m of [...MIGRATIONS].sort((a, b) => a.name.localeCompare(b.name))) {
      const earlier = rows.find((r) => r.migration_name === m.name)
      if (earlier?.finished_at) continue
      const id = earlier?.id ?? crypto.randomUUID()
      if (!earlier) await conn.query('INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "started_at") VALUES ($1, $2, $3, now())', [id, crypto.createHash('sha256').update(m.sql).digest('hex'), m.name])
      for (const sql of statements(m.sql)) {
        try {
          await conn.query(sql)
        } catch (e: any) {
          // a failed statement cancels the rest of a Postgres transaction, so each one stands on its own
          if (!(earlier && ALREADY_DONE.has(String(e?.code)))) throw e
        }
      }
      await conn.query('UPDATE "_prisma_migrations" SET "finished_at" = now(), "applied_steps_count" = 1 WHERE "id" = $1', [id])
      console.log(`Applied migration ${m.name}`)
    }
  } finally {
    if (locked) await conn.query('SELECT pg_advisory_unlock($1)', [String(LOCK_KEY)]).catch(() => {})
    await conn.end().catch(() => {})
  }
}
