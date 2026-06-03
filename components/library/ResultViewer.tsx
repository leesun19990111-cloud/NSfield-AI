'use client'

export function ResultViewer({ urls, status }: { urls: string[]; status: string }) {
  if (status !== 'SUCCEEDED') {
    return <div className="aspect-square rounded-lg bg-[var(--bg-surface-2)] flex items-center justify-center text-[var(--text-dim)]">
      {status === 'FAILED' ? '생성 실패 (환불됨)' : '생성 중…'}
    </div>
  }
  if (urls.length === 0) {
    return <div className="aspect-square rounded-lg bg-[var(--bg-surface-2)] flex items-center justify-center text-[var(--text-dim)]">
      파일이 삭제되었습니다 (30일 경과)
    </div>
  }
  return (
    <div className="space-y-3">
      {urls.map((u, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={u} alt={`결과 ${i + 1}`} className="w-full rounded-lg border border-[var(--border)]" />
      ))}
      <a href={urls[0]} download className="inline-block px-4 py-2 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-sm">다운로드</a>
    </div>
  )
}
