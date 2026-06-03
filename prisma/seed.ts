import { prisma } from '@/lib/db/prisma'
import { MODEL_CONFIGS } from '@/lib/models/catalog/registry'

async function main() {
  // 초기 환율 (없을 때만 — fx_rates는 append-only 이력이므로 중복 방지)
  const existingFx = await prisma.fxRate.findFirst({ where: { pair: 'USDKRW' } })
  if (!existingFx) {
    await prisma.fxRate.create({ data: { pair: 'USDKRW', rate: 1380, source: 'seed' } })
  }

  // 모델 카탈로그 = config 레지스트리 (단가는 운영 중 /admin/models에서 조정)
  for (const c of MODEL_CONFIGS) {
    const data = {
      kind: c.output,
      family: c.family,
      modality: c.modality,
      atlas_model: c.atlasModel,
      display_name: c.displayName,
      provider: c.provider,
      is_active: c.isActive,
      margin_pct: c.marginPct ?? 10,
      pricing_json: c.pricing as object,
    }
    await prisma.model.upsert({
      where: { id: c.id },
      update: data,
      create: { id: c.id, ...data },
    })
  }

  // config에 없는 레거시 모델은 비활성화 (gpt-image-2.0은 config에 있어 유지)
  const knownIds = MODEL_CONFIGS.map((c) => c.id)
  await prisma.model.updateMany({
    where: { id: { notIn: knownIds } },
    data: { is_active: false },
  })

  console.log('seed 완료:', MODEL_CONFIGS.length, '개 모델')
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
