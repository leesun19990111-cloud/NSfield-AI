import { prisma } from '@/lib/db/prisma'

export async function recordAdminAction(params: {
  adminId: string
  action: string
  targetType?: string
  targetId?: string
  before?: unknown
  after?: unknown
  reason?: string
}) {
  await prisma.adminAction.create({
    data: {
      admin_id: params.adminId,
      action: params.action,
      target_type: params.targetType ?? null,
      target_id: params.targetId ?? null,
      before_json: params.before === undefined ? undefined : (params.before as object),
      after_json: params.after === undefined ? undefined : (params.after as object),
      reason: params.reason ?? null,
    },
  })
}
