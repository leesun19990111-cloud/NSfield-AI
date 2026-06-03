// 클라이언트 측 입력 이미지 업로드 헬퍼: 파일 → POST /api/upload → 서명 URL
export async function uploadInputImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  form.append('filename', file.name)
  const res = await fetch('/api/upload', { method: 'POST', body: form })
  const json = await res.json()
  if (!res.ok || !json.ok) throw new Error(json.message || '업로드 실패')
  return json.url as string
}
