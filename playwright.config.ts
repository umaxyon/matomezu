// 実際のブラウザのテスト。bun run e2e。本番向けにビルドした画面（e2e/.dist）を、ワーカーごとに立てる常駐（matomezu serve）が配る（e2e/fixtures.ts）。
// 追加プラグインを取り込む画面（e2e/plugins/）は、見本のプラグインのフォルダを結んだ常駐で確かめる
import { defineConfig, devices } from "@playwright/test"
import type { HostOptions } from "./e2e/fixtures"

export default defineConfig<object, HostOptions>({
  testDir: "e2e",
  outputDir: "e2e/.results",
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
    locale: "ja-JP",
  },
  projects: [
    { name: "screen", testIgnore: ["plugins/**", "perf/**"] },
    { name: "plugins", testMatch: "plugins/**", use: { hostArgs: ["--plugin", "test/added-plugins/ex2"] } },
  ],
})
