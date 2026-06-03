export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 30000,
): Promise<Response> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(t)
  }
}
