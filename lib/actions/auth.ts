'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type ActionResult = { ok: true } | { ok: false; message: string }

export async function signInWithPassword(email: string, password: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, message: '이메일 또는 비밀번호가 올바르지 않습니다.' }
  return { ok: true }
}

export async function signUpWithPassword(email: string, password: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
  })
  if (error) {
    console.error('[signUp] failed:', error.message)
    return { ok: false, message: '가입에 실패했습니다. 이미 가입된 이메일이거나 비밀번호가 너무 짧을 수 있습니다.' }
  }
  return { ok: true }
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/auth/login')
}

export async function signInWithGoogle(): Promise<ActionResult & { url?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
  })
  if (error || !data.url) return { ok: false, message: 'Google 로그인에 실패했습니다.' }
  return { ok: true, url: data.url }
}
