import { NextResponse } from 'next/server'
import { requireUser, AuthError } from '@/lib/auth/guards'
import { atlasUploadMedia } from '@/lib/models/atlas/uploadMedia'
import { consumeRateLimit } from '@/lib/rate-limit/token-bucket'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  let user
  try {
    user = await requireUser()
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, message: '로그인이 필요합니다.' }, { status: 401 })
    throw e
  }
  // 가벼운 레이트리밋 (업로드 남용 방지): 30/분
  if (user.role !== 'ADMIN') {
    const ok = await consumeRateLimit(user.id, 'upload:min', 30, 60)
    if (!ok) return NextResponse.json({ ok: false, message: '업로드가 너무 많습니다. 잠시 후 다시 시도해주세요.' }, { status: 429 })
  }
  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof Blob)) return NextResponse.json({ ok: false, message: '파일이 필요합니다.' }, { status: 400 })
  // 크기/타입 가드 (≤30MB, 이미지)
  if (file.size > 30 * 1024 * 1024) return NextResponse.json({ ok: false, message: '파일이 너무 큽니다(최대 30MB).' }, { status: 400 })
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (file.type && !allowedTypes.includes(file.type)) {
    return NextResponse.json({ ok: false, message: '이미지 파일만 업로드 가능합니다.' }, { status: 400 })
  }
  const filename = (form.get('filename') as string) || 'upload'
  try {
    const url = await atlasUploadMedia(file, filename)
    return NextResponse.json({ ok: true, url })
  } catch (e) {
    console.error('[upload] failed:', e)
    return NextResponse.json({ ok: false, message: '업로드에 실패했습니다.' }, { status: 500 })
  }
}
