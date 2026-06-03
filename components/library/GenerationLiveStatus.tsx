'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// 현재 사용자의 generations UPDATE를 구독해 상태 변경 시 페이지 새로고침.
// RLS가 타인 행 구독을 차단한다.
export function GenerationLiveStatus({ userId }: { userId: string }) {
  const router = useRouter()
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`gen-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'generations', filter: `user_id=eq.${userId}` },
        () => { router.refresh() },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, router])
  return null
}
