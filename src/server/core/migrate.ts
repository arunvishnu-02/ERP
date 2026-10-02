import crypto from 'node:crypto'
import mariadb from 'mariadb'
import { dbConfig } from '../env'
import { MIGRATIONS } from '../migrations.generated'

// MySQL error numbers that mean "this step was already done", accepted only when finishing a migration that stopped half way.
const ALREADY_DONE = new Set([1050, 1060, 1061, 1826, 1022])

/** One statement per ";" at the end of a line. Comment lines are dropped. */
const statements = (sql: string) =>
  sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(/;\s*(?:\r?\n|$)/).map((s) => s.trim()).filter(Boolean)

/**
 * Applies the Prisma migrations that have not run yet, in name order, and records them in
 * _prisma_migrations in the same format `prisma migrate deploy` uses. So either tool can be used.
 * The SQL is compiled into the app (see scripts/embed-migrations.mjs), so nothing is read from disk.
 */
export async function migrate() {
  const conn = await mariadb.createConnection({ ...dbConfig(), connectTimeout: 10_000 })
  try {
    const [{ locked }] = await conn.query("SELECT GET_LOCK('cx_crm_erp_migrate', 60) AS locked")
    if (Number(locked) !== 1) throw new Error('Another process is updating the database')
    await conn.query(
      'CREATE TABLE IF NOT EXISTS `_prisma_migrations` (`id` VARCHAR(36) NOT NULL, `checksum` VARCHAR(64) NOT NULL, `finished_at` DATETIME(3) NULL, `migration_name` VARCHAR(255) NOT NULL, `logs` TEXT NULL, `rolled_back_at` DATETIME(3) NULL, `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `applied_steps_count` INTEGER UNSIGNED NOT NULL DEFAULT 0, PRIMARY KEY (`id`)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
    )
    const rows: { id: string; migration_name: string; finished_at: Date | null }[] = await conn.query('SELECT `id`, `migration_name`, `finished_at` FROM `_prisma_migrations` WHERE `rolled_back_at` IS NULL')
    for (const m of [...MIGRATIONS].sort((a, b) => a.name.localeCompare(b.name))) {
      const earlier = rows.find((r) => r.migration_name === m.name)
      if (earlier?.finished_at) continue
      const id = earlier?.id ?? crypto.randomUUID()
      if (!earlier) await conn.query('INSERT INTO `_prisma_migrations` (`id`, `checksum`, `migration_name`, `started_at`) VALUES (?, ?, ?, UTC_TIMESTAMP(3))', [id, crypto.createHash('sha256').update(m.sql).digest('hex'), m.name])
      for (const sql of statements(m.sql)) {
        try {
          await conn.query(sql)
        } catch (e: any) {
          if (!(earlier && ALREADY_DONE.has(e?.errno))) throw e
        }
      }
      await conn.query('UPDATE `_prisma_migrations` SET `finished_at` = UTC_TIMESTAMP(3), `applied_steps_count` = 1 WHERE `id` = ?', [id])
      console.log(`Applied migration ${m.name}`)
    }
  } finally {
    await conn.query("SELECT RELEASE_LOCK('cx_crm_erp_migrate')").catch(() => {})
    await conn.end().catch(() => {})
  }
}
