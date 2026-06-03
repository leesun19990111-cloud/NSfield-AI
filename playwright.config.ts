import { defineConfig } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'node:path'

dotenv.config({ path: path.resolve(__dirname, '.env.local') })

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  // 공용 실 DB의 모델 행(mock-image/mock-video is_active 등)을 토글하므로 직렬 실행한다.
  // 병렬 시 한 테스트의 afterAll(is_active=false)이 다른 테스트의 생성 흐름을 깨뜨릴 수 있다.
  workers: 1,
  use: { baseURL: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000' },
  webServer: {
    // dev 서버(NODE_ENV=development)로 구동: mock-image 어댑터가 production 레지스트리에서
    // 제외되므로(보안), E2E가 mock 생성을 검증하려면 non-production 런타임이 필요하다.
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
})
