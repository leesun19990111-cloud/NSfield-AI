import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// RLS를 우회한다. 서버 신뢰 경로(cron, 검증된 admin action)에서만 사용.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}
