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
  | 'USER_LOGIN'
  | 'USER_REGISTER'
  | 'PASSWORD_RESET_REQUEST'
  | 'PASSWORD_RESET_COMPLETE'
  | 'INVITE_REDEEMED'

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

/** Log an action performed by a regular (non-admin) user. Reuses AdminAuditLog table. */
export async function logUserAction(params: {
  userId: number
  username: string
  action: AuditAction
  entityType?: string
  entityId?: string
  details?: string
}): Promise<void> {
  await prisma.adminAuditLog.create({
    data: {
      adminId: params.userId,
      adminUsername: params.username,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      details: params.details,
    },
  }).catch((err) => {
    console.error('[audit] Failed to write audit log:', err)
  })
}
