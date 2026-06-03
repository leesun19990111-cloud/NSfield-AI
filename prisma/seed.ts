import { prisma } from '@/lib/db/prisma'

async function main() {
  // 초기 환율 (없을 때만 — fx_rates는 append-only 이력이므로 중복 방지)
  const existingFx = await prisma.fxRate.findFirst({ where: { pair: 'USDKRW' } })
  if (!existingFx) {
    await prisma.fxRate.create({ data: { pair: 'USDKRW', rate: 1380, source: 'seed' } })
  }

  // 모델 카탈로그 (단가는 운영 중 /admin/models에서 조정)
  const models = [
    { id: 'gpt-image-2.0', kind: 'IMAGE' as const, display_name: 'GPT-Image-2.0', provider: 'openai',
      pricing_json: { kind: 'per_image', usd_per_unit: 0.04 } },
    { id: 'seedream-4.5', kind: 'IMAGE' as const, display_name: 'Seedream 4.5', provider: 'bytedance',
      pricing_json: { kind: 'per_image', usd_per_unit: 0.03 } },
    { id: 'nanobanana-2.0', kind: 'IMAGE' as const, display_name: 'Nanobanana-2.0', provider: 'nanobanana',
      pricing_json: { kind: 'per_image', usd_per_unit: 0.02 } },
    { id: 'nanobanana-pro', kind: 'IMAGE' as const, display_name: 'Nanobanana Pro', provider: 'nanobanana',
      pricing_json: { kind: 'per_image', usd_per_unit: 0.05 } },
    { id: 'veo3', kind: 'VIDEO' as const, display_name: 'Veo3', provider: 'google',
      pricing_json: { kind: 'per_video_fixed', tiers: { '3': 0.3, '5': 0.45, '10': 0.82 },
        options: { allowed_durations_sec: [3, 5, 10], polling_interval_sec: 60 } } },
    { id: 'kling', kind: 'VIDEO' as const, display_name: 'Kling', provider: 'kuaishou',
      pricing_json: { kind: 'per_second', usd_per_unit: 0.07,
        options: { allowed_durations_sec: [5, 10], polling_interval_sec: 60 } } },
    { id: 'seedance-2.0', kind: 'VIDEO' as const, display_name: 'Seedance 2.0', provider: 'bytedance',
      pricing_json: { kind: 'per_video_fixed', tiers: { '5': 0.4, '10': 0.7, '15': 1.0 },
        options: { allowed_durations_sec: [5, 10, 15], polling_interval_sec: 60 } } },
  ]

  for (const m of models) {
    await prisma.model.upsert({
      where: { id: m.id },
      update: { pricing_json: m.pricing_json, display_name: m.display_name, provider: m.provider },
      create: { ...m, margin_pct: 10, is_active: true },
    })
  }

  console.log('seed 완료:', models.length, '개 모델')
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
