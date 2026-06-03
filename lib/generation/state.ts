export type GenStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED'

// 단방향 전이만 허용
const allowed: Record<GenStatus, GenStatus[]> = {
  PENDING: ['RUNNING', 'FAILED', 'CANCELED'],
  RUNNING: ['SUCCEEDED', 'FAILED'],
  SUCCEEDED: [],
  FAILED: [],
  CANCELED: [],
}

export function canTransition(from: GenStatus, to: GenStatus): boolean {
  return allowed[from].includes(to)
}
