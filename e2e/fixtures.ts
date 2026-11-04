// e2e の test: ワーカーごとに常駐（ビルドタグ e2e の matomezu serve。空の matomezu 保管庫フォルダ）を 1 つ立て、テストごとに、テストの用意の口で
// 常駐を空にしてから books（既定は E2E_BOOKS）を置く。画面と実行ファイルは global-setup.ts が 1 度だけ作る。
// ポートは常駐が空いている物を選ぶ（同時に流れているほかの e2e の常駐につながない）
import { spawn } from "node:child_process"
import { readFileSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { test as base } from "@playwright/test"
import { E2E_BOOKS } from "./books"

// test のほか（expect・Page など）は Playwright のまま
export * from "@playwright/test"

// ワーカーの常駐（画面を開く URL）
type Host = { url: string }

// ワーカーの常駐の matomezu 保管庫フォルダ
const homeOf = (worker: number) => resolve(`e2e/.home-${worker}`)

// 常駐が matomezu 保管庫フォルダに書いた、つなぎ方（無ければ undefined）
const serverIn = (home: string): { url: string; token: string; pid: number } | undefined => {
  try {
    return JSON.parse(readFileSync(`${home}/server.json`, "utf8"))
  } catch {
    return undefined
  }
}

// AI と CLI の入口に付ける合言葉（いま流れているテストのワーカーの常駐が、matomezu 保管庫フォルダに書いたもの）
export const aiAuth = () => ({
  Authorization: `Bearer ${serverIn(homeOf(test.info().workerIndex))!.token}`,
})

// ワーカーごとの Playwright の option（playwright.config.ts の use で渡す）
export type HostOptions = { hostArgs: string[] }

export const test = base.extend<{ books: readonly object[]; reset: undefined }, HostOptions & { host: Host }>({
  // 常駐の serve に足す引数（追加プラグインのフォルダを結ぶ --plugin など）
  hostArgs: [[], { option: true, scope: "worker" }],
  host: [
    async ({ hostArgs }, use, info) => {
      const home = homeOf(info.workerIndex)
      rmSync(home, { recursive: true, force: true })
      const serve = spawn(
        resolve("e2e/.matomezu"),
        ["serve", "--addr", "127.0.0.1:0", "--web", "e2e/.dist", ...hostArgs],
        {
          env: { ...process.env, MATOMEZU_HOME: home },
          stdio: ["ignore", "ignore", "inherit"],
        },
      )
      // 立てた serve が自分のフォルダに書いたつなぎ方を待つ（pid で、ほかの常駐の物でないと確かめる）
      const answering = async (url: string) =>
        fetch(`${url}/api/data`).then(
          r => r.ok,
          () => false,
        )
      for (;;) {
        if (serve.exitCode !== null) throw new Error(`matomezu serve stopped (${serve.exitCode})`)
        const server = serverIn(home)
        const url = server && server.pid === serve.pid ? server.url.replace(/\/$/, "") : undefined
        if (url && (await answering(url))) {
          await use({ url })
          break
        }
        await new Promise(r => setTimeout(r, 50))
      }
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
