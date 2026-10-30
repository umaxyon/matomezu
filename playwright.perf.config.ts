// 速さを測る実際のブラウザのテスト。bun run e2e:perf。普段の e2e（playwright.config.ts）とは分け、合否ではなく数値を出す。
// 本番向けにビルドした画面（e2e/.perf-dist）を常駐（matomezu serve、空のアプリのフォルダ）が配る。数値は端末の表と e2e/.perf/ の JSON に出す
import { defineConfig, devices } from "@playwright/test"

const port = 5311
const serverPort = 5312

export default defineConfig({
  testDir: "e2e/perf",
  outputDir: "e2e/.results-perf",
  reporter: [["list"]],
  timeout: 600_000,
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
    locale: "ja-JP",
    baseURL: `http://127.0.0.1:${serverPort}`,
  },
  webServer: [
    {
      command: `rm -rf e2e/.perf-dist && bun build web/index.html --outdir e2e/.perf-dist --production && bun scripts/fonts.ts copy e2e/.perf-dist/fonts && bun scripts/serve.ts ${port} e2e/.perf-dist`,
      url: `http://localhost:${port}`,
      reuseExistingServer: false,
    },
    {
      command: `bun scripts/e2e-server.ts ${serverPort} e2e/.perf-dist http://localhost:${port}`,
      url: `http://127.0.0.1:${serverPort}`,
      reuseExistingServer: false,
    },
  ],
})
