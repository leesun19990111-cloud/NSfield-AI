import { z } from 'zod'
import type { ModelConfig, FieldType } from '@/lib/models/catalog/types'

function fieldSchema(f: FieldType): { key: string; schema: z.ZodTypeAny } | null {
  switch (f.kind) {
    case 'prompt':
      return { key: 'prompt', schema: z.string().trim().min(1).max(2000) }
    case 'negative_prompt':
      return { key: 'negative_prompt', schema: z.string().max(2000).optional() }
    case 'select': {
      const vals = f.options.map((o) => o.value) as [string, ...string[]]
      return { key: f.param, schema: z.enum(vals).optional() }
    }
    case 'int': {
      let s = z.coerce.number().int()
      if (f.min !== undefined) s = s.min(f.min)
      if (f.max !== undefined) s = s.max(f.max)
      const base = f.options
        ? z.coerce.number().int().refine((n) => f.options!.includes(n), { message: '허용되지 않은 값' })
        : s
      return { key: f.param, schema: base.optional() }
    }
    case 'toggle':
      return { key: f.param, schema: z.coerce.boolean().optional() }
    case 'image':
      return { key: f.param, schema: f.required ? z.string().min(1) : z.string().min(1).optional() }
    case 'images':
      return { key: f.param, schema: z.array(z.string().min(1)).max(f.max).optional() }
    case 'video_clip': {
      const clip = z.object({
        url: z.string().min(1),
        start: z.coerce.number().min(0).default(0),
        ends: z.coerce.number().min(0).default(0),
        fps: z.coerce.number().min(0).max(24).default(1),
      })
      const arr = z.array(clip).min(1).max(1)
      return { key: f.param, schema: f.required ? arr : arr.optional() }
    }
  }
}

export function buildInputSchema(config: ModelConfig): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const f of [...config.fields, ...(config.advancedFields ?? [])]) {
    const fs = fieldSchema(f)
    if (fs) shape[fs.key] = fs.schema
  }
  return z.object(shape) as z.ZodType<Record<string, unknown>>
}
