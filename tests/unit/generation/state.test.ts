import { describe, it, expect } from 'vitest'
import { canTransition } from '@/lib/generation/state'

describe('canTransition', () => {
  it('PENDING→RUNNING 허용', () => { expect(canTransition('PENDING', 'RUNNING')).toBe(true) })
  it('RUNNING→SUCCEEDED 허용', () => { expect(canTransition('RUNNING', 'SUCCEEDED')).toBe(true) })
  it('SUCCEEDED→RUNNING 금지', () => { expect(canTransition('SUCCEEDED', 'RUNNING')).toBe(false) })
  it('PENDING→SUCCEEDED 금지(중간 RUNNING 필요)', () => { expect(canTransition('PENDING', 'SUCCEEDED')).toBe(false) })
})
