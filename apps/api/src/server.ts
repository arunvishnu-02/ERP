import fs from 'node:fs'
import { createApp } from './app.js'
import { startScheduler } from './core/jobs.js'
import { migrate } from './core/migrate.js'
import { prisma } from './db.js'
import { env } from './env.js'

await migrate()
fs.mkdirSync(env.uploadDir, { recursive: true })
const server = createApp().listen(env.port, () => console.log(`CX CRM ERP API listening on port ${env.port}`))
if (env.runJobs) startScheduler()

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close(async () => {
      await prisma.$disconnect()
      process.exit(0)
    })
  })
}
