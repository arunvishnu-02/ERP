import { PrismaPg } from '@prisma/adapter-pg'
import { Prisma, PrismaClient } from '../generated/prisma/client'
import { dbUrl, env } from './env'

// One client per server process. Kept on globalThis so hot reloads in development do not open new pools.
const store = globalThis as unknown as { __cxPrisma?: PrismaClient }
const client = () => (store.__cxPrisma ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl(), max: env.poolSize }) }))

/** The Prisma client. It connects on first use, so importing this file never needs the database. */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, key) {
    const c = client() as any
    const v = c[key]
    return typeof v === 'function' ? v.bind(c) : v
  },
})
export type Tx = Prisma.TransactionClient
/** The plain client typed as a transaction client, for helpers that accept either. */
export const db = prisma as unknown as Tx
export { Prisma }
