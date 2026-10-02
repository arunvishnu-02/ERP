import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, Prisma } from './generated/prisma/client.js'
import { env } from './env.js'

export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.databaseUrl }) })
export type Tx = Prisma.TransactionClient
/** The plain client typed as a transaction client, for helpers that accept either. */
export const db = prisma as unknown as Tx
export { Prisma }
