'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signUpWithPassword, signInWithGoogle } from '@/lib/actions/auth'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await signUpWithPassword(email, password)
    setLoading(false)
    if (res.ok) {
      router.refresh()
      router.push('/wallet')
    } else {
      setError(res.message)
    }
  }

  async function onGoogle() {
    const res = await signInWithGoogle()
    if (res.ok && res.url) window.location.href = res.url
    else if (!res.ok) setError(res.message)
  }

  return (
    <div className="space-y-4">
      <button
        onClick={onGoogle}
        className="w-full py-2.5 rounded-md bg-[var(--bg-surface-2)] border border-[var(--border)] hover:bg-[var(--bg-surface)]"
      >
        Google로 계속하기
      </button>
      <div className="text-center text-xs text-[var(--text-dim)]">또는</div>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="email" required placeholder="이메일" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-[var(--bg-surface-2)] border border-[var(--border)]"
        />
        <input
          type="password" required placeholder="비밀번호" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-[var(--bg-surface-2)] border border-[var(--border)]"
        />
        {error && <p className="text-[var(--danger)] text-sm">{error}</p>}
        <button
          type="submit" disabled={loading}
          className="w-full py-2.5 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {loading ? '가입 중…' : '가입하기'}
        </button>
      </form>
      <p className="text-center text-sm text-[var(--text-muted)]">
        이미 계정이 있으신가요? <Link href="/auth/login" className="text-[var(--accent)]">로그인</Link>
      </p>
    </div>
  )
}
