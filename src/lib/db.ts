import Database from 'better-sqlite3'
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

function createPrismaClient() {
  const url = (process.env.DATABASE_URL ?? 'file:./dev.db').replace(/^file:/, '')
  // Set file-level pragmas via a temporary connection — journal_mode and synchronous persist to the SQLite file.
  const setup = new Database(url)
  setup.pragma('journal_mode = WAL')
  setup.pragma('synchronous = NORMAL')
  setup.close()
  // The adapter creates its own Database connection internally; foreign_keys (per-connection only)
  // is enforced at startup via $executeRawUnsafe below.
  const adapter = new PrismaBetterSqlite3({ url })
  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })
  // Enable FK enforcement on the adapter's connection. better-sqlite3 is synchronous so this
  // runs immediately before the first ORM query, even though the API is async.
  client.$executeRawUnsafe('PRAGMA foreign_keys = ON').catch(() => {})
  return client
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
