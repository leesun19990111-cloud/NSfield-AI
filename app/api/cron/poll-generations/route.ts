import { NextResponse } from 'next/server'
import { pollRunningVideoGenerations } from '@/lib/jobs/poll-generations'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  try {
    const result = await pollRunningVideoGenerations()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error('[poll-generations] failed:', e)
    return NextResponse.json({ ok: false, error: 'POLL_FAILED' }, { status: 500 })
  }
}
