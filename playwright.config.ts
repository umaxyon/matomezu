// 実際のブラウザでのテスト。bun run e2e。本番向けにビルドした画面（e2e/.dist）を、
// サーバーなしの画面は scripts/serve.ts で、常駐を通す画面（e2e/server/）は matomezu serve（空のアプリのフォルダ）で、
// 追加プラグインを取り込む画面（e2e/plugins/）は見本のプラグインのフォルダを結んだ matomezu serve で配る
import { defineConfig, devices } from "@playwright/test"

const port = 5301
const serverPort = 5302
const pluginsPort = 5303

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/.results",
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
    locale: "ja-JP",
  },
  projects: [
    {
      name: "screen",
      testIgnore: ["server/**", "plugins/**", "perf/**"],
      use: { baseURL: `http://localhost:${port}` },
    },
    { name: "server", testMatch: "server/**", use: { baseURL: `http://127.0.0.1:${serverPort}` } },
    { name: "plugins", testMatch: "plugins/**", use: { baseURL: `http://127.0.0.1:${pluginsPort}` } },
  ],
  webServer: [
    {
      command: `rm -rf e2e/.dist && bun build web/index.html --outdir e2e/.dist --production && bun scripts/fonts.ts copy e2e/.dist/fonts && bun scripts/serve.ts ${port} e2e/.dist`,
      url: `http://localhost:${port}`,
      reuseExistingServer: false,
    },
    {
      command: `bun scripts/e2e-server.ts ${serverPort} e2e/.dist http://localhost:${port}`,
      url: `http://127.0.0.1:${serverPort}`,
      reuseExistingServer: false,
    },
    {
      command: `bun scripts/e2e-server.ts ${pluginsPort} e2e/.dist http://localhost:${port} --plugin test/added-plugins/ex2`,
      url: `http://127.0.0.1:${pluginsPort}`,
      reuseExistingServer: false,
    },
  ],
})
