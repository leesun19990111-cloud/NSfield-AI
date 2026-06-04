// NS Field — 모델별 미리보기 썸네일 생성 (OpenAI gpt-image-1)
// 사용: node mockups/gen-previews.mjs   (프로젝트 루트에서)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dir, '..')
const OUT = join(__dir, 'img')
mkdirSync(OUT, { recursive: true })

// .env.local 에서 OPENAI_API_KEY 로드
function loadKey() {
  for (const f of ['.env.local', '.env']) {
    const p = join(ROOT, f)
    if (!existsSync(p)) continue
    const m = readFileSync(p, 'utf8').match(/^OPENAI_API_KEY\s*=\s*"?([^"\r\n]+)"?/m)
    if (m) return m[1].trim()
  }
  throw new Error('OPENAI_API_KEY 없음 (.env.local 확인)')
}
const KEY = loadKey()

const LANDSCAPE = '1536x1024' // 영상(16:9 느낌)
const SQUARE = '1024x1024' // 이미지

// 모델별 프롬프트 — 패밀리 테마 + 모달리티(영상=시네마틱 프레임). 전부 SFW.
const MODELS = [
  { id: 'nanobanana-2-t2i', size: SQUARE, prompt: 'Sleek photorealistic still life, a single glossy banana on a deep violet studio backdrop, dramatic rim light, premium minimal product photography' },
  { id: 'nanobanana-2-ref2i', size: SQUARE, prompt: 'Two consistent product shots side by side, a banana reimagined as a neon-glowing sculpture, violet and magenta studio lighting, clean' },
  { id: 'nanobanana-pro-t2i', size: SQUARE, prompt: 'Hyper-detailed macro photograph of a golden banana with intricate skin texture, luxury studio lighting, crisp 8k feel, deep purple background' },
  { id: 'seedream-v4-t2i', size: SQUARE, prompt: 'Dreamy surreal digital painting, a floating island with cascading waterfalls at sunset, vivid teal and orange palette, cinematic concept art' },
  { id: 'seedream-v4.5-t2i', size: SQUARE, prompt: 'Ethereal portrait of a figure made of flowing liquid light, iridescent rainbow colors, high fashion editorial, dreamlike, ultra detailed' },
  { id: 'gpt-image-2.0', size: SQUARE, prompt: 'Playful creative illustration, an astronaut gently painting glowing stars onto a dark night sky, whimsical, bright accent colors, clean composition' },
  { id: 'veo3.1-t2v', size: LANDSCAPE, prompt: 'Cinematic film still, a lone traveler walking through a neon-lit rainy Tokyo street at night, anamorphic widescreen, moody atmosphere' },
  { id: 'veo3.1-i2v', size: LANDSCAPE, prompt: 'Cinematic widescreen frame, ocean waves crashing on dark rocks at golden hour, dramatic sky, subtle motion blur, film grain' },
  { id: 'veo3.1-ref2v', size: LANDSCAPE, prompt: 'Cinematic shot of a futuristic explorer standing in a glowing bioluminescent forest, volumetric light beams, consistent character, widescreen' },
  { id: 'veo3.1-fast-t2v', size: LANDSCAPE, prompt: 'Cinematic still, a sports car speeding along a coastal highway at sunset, dynamic motion, warm lens flare, widescreen' },
  { id: 'veo3.1-fast-i2v', size: LANDSCAPE, prompt: 'Cinematic widescreen frame, a hot air balloon rising over misty mountains at dawn, serene, soft light' },
  { id: 'seedance-2-t2v', size: LANDSCAPE, prompt: 'Dynamic motion frame, a contemporary dancer mid-leap with flowing fabric, dramatic studio spotlight, energetic motion trails, widescreen' },
  { id: 'seedance-2-i2v', size: LANDSCAPE, prompt: 'Cinematic widescreen frame of a powerful waterfall in a lush green jungle, mist and sunbeams, vivid, sense of motion' },
  { id: 'seedance-2-ref2v', size: LANDSCAPE, prompt: 'Energetic cinematic frame, a parkour athlete vaulting across city rooftops at sunset, dynamic low angle, urban, widescreen' },
  { id: 'kling-v3-std-t2v', size: LANDSCAPE, prompt: 'Cinematic realistic frame, a majestic eagle soaring over snowy mountain peaks, epic scale, sharp, widescreen' },
  { id: 'kling-v3-pro-t2v', size: LANDSCAPE, prompt: 'Ultra realistic cinematic shot, a tiger walking through tall golden grass at dusk, shallow depth of field, premium, widescreen' },
  { id: 'kling-v3-std-i2v', size: LANDSCAPE, prompt: 'Cinematic frame, a glittering city skyline at blue hour with glowing windows, smooth atmospheric haze, widescreen' },
  { id: 'kling-v3-pro-i2v', size: LANDSCAPE, prompt: 'Ultra realistic cinematic aerial frame, a luxury yacht cutting through turquoise ocean water, vivid, premium, widescreen' },
]

async function gen(m) {
  const body = {
    model: 'gpt-image-1',
    prompt: m.prompt,
    n: 1,
    size: m.size,
    quality: 'low',
    output_format: 'webp',
    output_compression: 55,
  }
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`${res.status} ${t.slice(0, 200)}`)
  }
  const json = await res.json()
  const b64 = json?.data?.[0]?.b64_json
  if (!b64) throw new Error('빈 응답')
  const file = join(OUT, `${m.id}.webp`)
  writeFileSync(file, Buffer.from(b64, 'base64'))
  return file
}

// 분당 5장 rate limit → 순차 + 14초 간격, 이미 있는 건 skip, 429는 백오프 재시도
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const todo = MODELS.filter((m) => !existsSync(join(OUT, `${m.id}.webp`)))
console.log(`생성 대상 ${todo.length}개 (이미 있는 ${MODELS.length - todo.length}개 skip)`)
let ok = 0
const failed = []
for (let n = 0; n < todo.length; n++) {
  const m = todo[n]
  let done = false
  for (let attempt = 1; attempt <= 4 && !done; attempt++) {
    try {
      await gen(m)
      console.log(`[${n + 1}/${todo.length}] OK  ${m.id}`)
      ok++
      done = true
    } catch (e) {
      const is429 = /\b429\b/.test(e.message)
      if (is429 && attempt < 4) {
        console.log(`[${n + 1}/${todo.length}] 429 → 65초 대기 후 재시도 ${m.id}`)
        await sleep(65000)
      } else {
        console.log(`[${n + 1}/${todo.length}] FAIL ${m.id} — ${e.message.slice(0, 80)}`)
        failed.push(m.id)
        done = true
      }
    }
  }
  if (n < todo.length - 1) await sleep(14000) // 다음 요청까지 간격
}
console.log(`\n완료: ${ok}/${todo.length} 신규 성공 (총 ${MODELS.length - todo.length + ok}/${MODELS.length})`)
if (failed.length) console.log('실패:', failed.join(', '))
