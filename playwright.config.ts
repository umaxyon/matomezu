// 実際のブラウザでのテスト。bun run e2e。本番向けにビルドした画面を scripts/serve.ts で配る
import { defineConfig, devices } from "@playwright/test";

const port = 5301;

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/.results",
  reporter: [["list"]],
  use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, locale: "ja-JP", baseURL: `http://localhost:${port}` },
  webServer: { command: `bun run build && bun scripts/serve.ts ${port}`, url: `http://localhost:${port}`, reuseExistingServer: false },
});
