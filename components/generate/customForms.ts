import type { ComponentType } from 'react'

// 모델별 전용 폼 등록 지점. 비어있으면 제너릭(DynamicGenerator) 사용.
export const customForms: Record<string, ComponentType<{ modelId: string; fxRate: number }>> = {}
