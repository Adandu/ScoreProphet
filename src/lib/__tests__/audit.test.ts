import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    adminAuditLog: {
      create: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/db'
import { logAdminAction } from '@/lib/audit'

describe('logAdminAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes an admin audit log entry', async () => {
    vi.mocked(prisma.adminAuditLog.create).mockResolvedValue({} as never)

    await logAdminAction({
      adminId: 1,
      adminUsername: 'admin',
      action: 'SYNC_MATCHES',
      details: 'Synced 4 matches',
    })

    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        adminId: 1,
        adminUsername: 'admin',
        action: 'SYNC_MATCHES',
        details: 'Synced 4 matches',
      },
    })
  })
})
