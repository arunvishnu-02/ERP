// Starts a local PostgreSQL for development, without Docker. Data is kept in apps/api/.pgdata.
// Usage: npm run db:local   (leave it running, then start the API in another terminal)
import EmbeddedPostgres from 'embedded-postgres'
import fs from 'node:fs'

const port = Number(process.env.PGPORT ?? 5433)
const dir = process.env.PGDATA_DIR ?? './.pgdata'
const fresh = !fs.existsSync(dir)
const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'cx', password: 'cx', port, persistent: true, createPostgresUser: process.getuid?.() === 0, onLog: () => {}, onError: (e) => console.error(String(e)) })
if (fresh) await pg.initialise()
await pg.start()
if (fresh) await pg.createDatabase('cx')
console.log(`PostgreSQL is running. DATABASE_URL=postgresql://cx:cx@localhost:${port}/cx`)
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, async () => { await pg.stop(); process.exit(0) })
