// e2e の test: ワーカーごとに常駐（ビルドタグ e2e の matomezu serve。空の matomezu 保管庫フォルダ）を 1 つ立て、テストごとに、テストの用意の口で
// 常駐を空にしてから books（既定は E2E_BOOKS）を置く。画面と実行ファイルは global-setup.ts が 1 度だけ作る
import { spawn } from "node:child_process"
import { readFileSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { test as base } from "@playwright/test"
import { E2E_BOOKS } from "./books"

// test のほか（expect・Page など）は Playwright のまま
export * from "@playwright/test"

// 1 つ目のワーカーの常駐のポート（ワーカーの番号を足す）
const FIRST_PORT = 5400

// ワーカーの常駐（画面を開く URL）
type Host = { url: string }

// ワーカーの常駐の matomezu 保管庫フォルダ
const homeOf = (worker: number) => resolve(`e2e/.home-${FIRST_PORT + worker}`)

// AI と CLI の入口に付ける合言葉（いま流れているテストのワーカーの常駐が、matomezu 保管庫フォルダに書いたもの）
export const aiAuth = () => ({
  Authorization: `Bearer ${JSON.parse(readFileSync(`${homeOf(test.info().workerIndex)}/server.json`, "utf8")).token}`,
})

// ワーカーごとの選び値（playwright.config.ts の use で渡す）
export type HostOptions = { hostArgs: string[] }

export const test = base.extend<{ books: readonly object[]; reset: undefined }, HostOptions & { host: Host }>({
  // 常駐の serve に足す引数（追加プラグインのフォルダを結ぶ --plugin など）
  hostArgs: [[], { option: true, scope: "worker" }],
  host: [
    async ({ hostArgs }, use, info) => {
      const port = FIRST_PORT + info.workerIndex
      const home = homeOf(info.workerIndex)
      rmSync(home, { recursive: true, force: true })
      const serve = spawn(
        resolve("e2e/.matomezu"),
        ["serve", "--addr", `127.0.0.1:${port}`, "--web", "e2e/.dist", ...hostArgs],
        {
          env: { ...process.env, MATOMEZU_HOME: home },
          stdio: ["ignore", "ignore", "inherit"],
        },
      )
      const url = `http://127.0.0.1:${port}`
      for (;;) {
        if (serve.exitCode !== null) throw new Error(`matomezu serve stopped (${serve.exitCode})`)
        if (
          await fetch(`${url}/api/data`).then(
            r => r.ok,
            () => false,
          )
        )
          break
        await new Promise(r => setTimeout(r, 50))
      }
      await use({ url })
      serve.kill()
    },
    { scope: "worker" },
  ],
  baseURL: async ({ host }, use) => use(host.url),
  // テストが始まるときに常駐に置くブック
  books: [E2E_BOOKS, { option: true }],
  reset: [
    async ({ host, books }, use) => {
      const done = await fetch(`${host.url}/api/reset-for-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ books }),
      })
      if (!done.ok) throw new Error(`reset-for-test: ${done.status} ${await done.text()}`)
      await use(undefined)
    },
    { auto: true },
  ],
})
