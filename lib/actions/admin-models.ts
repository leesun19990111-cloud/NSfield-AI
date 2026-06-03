'use server'

import { requireAdmin } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { recordAdminAction } from '@/lib/audit/record'
import { updateModelSchema, type UpdateModelInput } from '@/lib/validation/model'
import { revalidatePath } from 'next/cache'

export type AdminActionResult = { ok: true } | { ok: false; message: string }

export async function listAllModels() {
  await requireAdmin()
  return prisma.model.findMany({ orderBy: [{ kind: 'asc' }, { id: 'asc' }] })
}

export async function getModelForEdit(id: string) {
  await requireAdmin()
  return prisma.model.findUnique({ where: { id } })
}

export async function updateModel(
  id: string,
  input: UpdateModelInput,
): Promise<AdminActionResult> {
  const admin = await requireAdmin()
  const parsed = updateModelSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: '입력값을 확인해주세요. (가격 규칙 형식 포함)' }
  }
  const before = await prisma.model.findUnique({ where: { id } })
  if (!before) return { ok: false, message: '모델을 찾을 수 없습니다.' }
  const d = parsed.data
  await prisma.model.update({
    where: { id },
    data: {
      display_name: d.display_name,
      is_active: d.is_active,
      margin_pct: d.margin_pct,
      pricing_json: d.pricing_json as object,
    },
  })
  await recordAdminAction({
    adminId: admin.id,
    action: 'update_model',
    targetType: 'model',
    targetId: id,
    before: {
      display_name: before.display_name,
      is_active: before.is_active,
      margin_pct: Number(before.margin_pct),
      pricing_json: before.pricing_json,
    },
    after: {
      display_name: d.display_name,
      is_active: d.is_active,
      margin_pct: d.margin_pct,
      pricing_json: d.pricing_json,
    },
  })
  revalidatePath('/admin/models')
  revalidatePath(`/admin/models/${id}`)
  return { ok: true }
}

export async function toggleModel(
  id: string,
  active: boolean,
): Promise<AdminActionResult> {
  const admin = await requireAdmin()
  const before = await prisma.model.findUnique({ where: { id } })
  if (!before) return { ok: false, message: '모델을 찾을 수 없습니다.' }
  await prisma.model.update({ where: { id }, data: { is_active: active } })
  await recordAdminAction({
    adminId: admin.id,
    action: 'toggle_model',
    targetType: 'model',
    targetId: id,
    before: { is_active: before.is_active },
    after: { is_active: active },
  })
  revalidatePath('/admin/models')
  return { ok: true }
}
