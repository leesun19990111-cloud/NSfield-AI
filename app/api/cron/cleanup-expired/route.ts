import { NextResponse } from 'next/server'
import { cleanupExpiredGenerations } from '@/lib/jobs/cleanup-expired'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  try {
    const result = await cleanupExpiredGenerations()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error('[cleanup-expired] failed:', e)
    return NextResponse.json({ ok: false, error: 'CLEANUP_FAILED' }, { status: 500 })
  }
}
