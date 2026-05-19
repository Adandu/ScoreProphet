import { prisma } from '@/lib/db'

export type AuditAction =
  | 'SYNC_MATCHES'
  | 'RECALCULATE_POINTS'
  | 'UPDATE_MATCH'
  | 'RESET_MATCH_OVERRIDE'
  | 'DELETE_USER'
  | 'CREATE_CHAMPIONSHIP'
  | 'UPDATE_CHAMPIONSHIP'
  | 'DELETE_CHAMPIONSHIP'
  | 'UPDATE_MEMBERS'
  | 'UPDATE_MANAGERS'
  | 'GENERATE_INVITE'

export async function logAdminAction(params: {
  adminId: number
  adminUsername: string
  action: AuditAction
  entityType?: string
  entityId?: string
  details?: string
}): Promise<void> {
  await prisma.adminAuditLog.create({ data: params }).catch((err) => {
    console.error('[audit] Failed to write audit log:', err)
  })
}
