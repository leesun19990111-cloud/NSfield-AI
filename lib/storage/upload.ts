import { createAdminClient } from '@/lib/supabase/admin'

export type UploadInput = { path: string; b64: string; contentType: string }

export async function uploadGenerationImages(items: UploadInput[]): Promise<string[]> {
  const supabase = createAdminClient()
  const paths: string[] = []
  for (const it of items) {
    const buffer = Buffer.from(it.b64, 'base64')
    const { error } = await supabase.storage
      .from('generations')
      .upload(it.path, buffer, { contentType: it.contentType, upsert: true })
    if (error) throw new Error('STORAGE_UPLOAD_FAILED: ' + error.message)
    paths.push(it.path)
  }
  return paths
}

export async function deleteGenerationObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const supabase = createAdminClient()
  await supabase.storage.from('generations').remove(paths)
}
