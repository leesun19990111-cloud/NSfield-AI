import { NextResponse } from 'next/server'
import { runBackup } from '@/lib/jobs/backup'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  try {
    // UTC 날짜 (cron 실행 시점). 결정성 위해 함수는 dateStr 주입형.
    const dateStr = new Date().toISOString().slice(0, 10)
    const result = await runBackup(dateStr)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error('[backup] failed:', e)
    return NextResponse.json({ ok: false, error: 'BACKUP_FAILED' }, { status: 500 })
  }
}
