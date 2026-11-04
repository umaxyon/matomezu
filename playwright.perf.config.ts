// 速さを測る実際のブラウザのテスト。bun run e2e:perf。普段の e2e（playwright.config.ts）とは分け、合否ではなく数値を出す。
// 画面と常駐は普段の e2e と同じ（global-setup.ts が作り、e2e/fixtures.ts がワーカーの常駐を立てる）。数値は端末の表と e2e/.perf/ の JSON に出す
import { defineConfig, devices } from "@playwright/test"
import type { HostOptions } from "./e2e/fixtures"

export default defineConfig<object, HostOptions>({
  testDir: "e2e/perf",
  outputDir: "e2e/.results-perf",
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  timeout: 600_000,
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
    locale: "ja-JP",
  },
})
