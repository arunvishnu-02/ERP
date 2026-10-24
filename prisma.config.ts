import { defineConfig } from 'prisma/config'

// Prisma 7 reads the database address from here. The app itself reads DATABASE_URL in src/server/env.ts.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? 'postgresql://cx:cx@127.0.0.1:5432/cx' },
})
