// 実際のブラウザでのテスト。bun run e2e。本番向けにビルドした画面（e2e/.dist）を scripts/serve.ts で配る
import { defineConfig, devices } from "@playwright/test"

const port = 5301

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/.results",
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
    locale: "ja-JP",
    baseURL: `http://localhost:${port}`,
  },
  webServer: {
    command: `rm -rf e2e/.dist && bun build web/index.html --outdir e2e/.dist --production && bun scripts/serve.ts ${port} e2e/.dist`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
  },
})
