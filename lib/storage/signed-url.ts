import { createAdminClient } from '@/lib/supabase/admin'

export async function getSignedUrl(path: string, expiresInSec = 300): Promise<string | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage
    .from('generations')
    .createSignedUrl(path, expiresInSec)
  if (error || !data) return null
  return data.signedUrl
}
