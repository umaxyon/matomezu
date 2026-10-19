// 実際のブラウザでのテスト。bun run e2e。画面は bun の開発サーバーで出す
import { defineConfig, devices } from "@playwright/test";

const port = 5174;

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/.results",
  reporter: [["list"]],
  use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, locale: "ja-JP", baseURL: `http://localhost:${port}` },
  webServer: { command: `bun --port=${port} web/index.html`, url: `http://localhost:${port}`, reuseExistingServer: false },
});
