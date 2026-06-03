import { NextResponse } from 'next/server'
import { refreshFxRate } from '@/lib/fx/service'

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  try {
    const rate = await refreshFxRate()
    return NextResponse.json({ ok: true, rate })
  } catch (e) {
    console.error('[fx-update] failed:', e)
    return NextResponse.json({ ok: false, error: 'FX_REFRESH_FAILED' }, { status: 500 })
  }
}
