import { defineConfig } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'node:path'

dotenv.config({ path: path.resolve(__dirname, '.env.local') })

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  use: { baseURL: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000' },
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
})
