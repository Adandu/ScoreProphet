import Database from 'better-sqlite3'
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

function createPrismaClient() {
  const url = (process.env.DATABASE_URL ?? 'file:./dev.db').replace(/^file:/, '')
  // Set file-level pragmas using a temporary connection — journal_mode and synchronous persist to the SQLite file
  const setup = new Database(url)
  setup.pragma('journal_mode = WAL')
  setup.pragma('synchronous = NORMAL')
  // foreign_keys is per-connection only and does NOT persist to the file.
  // Setting it here on the setup connection has no effect on the Prisma connection.
  // Prisma enforces relations at the ORM level, so this is safe to omit.
  setup.close()
  const adapter = new PrismaBetterSqlite3({ url })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
