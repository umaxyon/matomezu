// e2e の test: ワーカーごとに常駐（ビルドタグ e2e の matomezu serve。空の matomezu 保管庫フォルダ）を 1 つ立て、テストごとに、テストの用意の口で
// 常駐を空にしてから books（既定は SAMPLE_BOOKS）を置く。画面と実行ファイルは global-setup.ts が 1 度だけ作る。
// ポートは常駐が空いている物を選ぶ（同時に流れているほかの e2e の常駐につながない）
import { spawn } from "node:child_process"
import { readFileSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { type BrowserContext, test as base, type Page } from "@playwright/test"
import { SAMPLE_BOOKS } from "../test/sample-books"
import { storedBooks } from "./helpers/stored"

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

// 参加が確定してワークルームに入っている AI の合言葉と参加の id のヘッダ（AI はアクションを — ブックを変える・郵便を送るなども — 参加が確定してワークルームに入るまで使えない）。
// 常駐の用意の口で参加者を 1 人置く（郵便は送らない）
export const joinedAiAuth = async () => {
  const server = serverIn(homeOf(test.info().workerIndex))!
  const made = await fetch(`${server.url}/api/joined-ai-for-test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  })
  if (!made.ok) throw new Error(`joined-ai-for-test: ${made.status} ${await made.text()}`)
  const { participant } = (await made.json()) as { participant: string }
  return { ...aiAuth(), "X-Matomezu-Participant": participant }
}

// ワーカーごとの Playwright の option（playwright.config.ts の use で渡す）
export type HostOptions = { hostArgs: string[] }
// テストごとの Playwright の option
export type TestOptions = { enabledPlugins: readonly string[] }

// 開いた直後（URL が無いとき）はコントロールセンターがカレントスクリーンになる。ブックスクリーンから始めるテストは BOOK_SCREEN_URL、コントロールセンターから始めるテストは CONTROL_CENTER_URL を開く
export const BOOK_SCREEN_URL = "/?f=book"

// ブック book（無ければ、何も開かないステージ）を開いたブックスクリーンがカレントスクリーンになっている場所の URL（コントロールセンター c1 の後ろに、ブックスクリーン c2）
export const bookScreenUrl = (book: string | null): string =>
  `/?sc=${encodeURIComponent(
    JSON.stringify({
      s: [
        { i: "c1", d: "@matomezu/control-center:screen" },
        { i: "c2", d: "@matomezu/base:book-screen", g: { l: [{ b: book, v: [1, 0, 0] }], c: 0, r: 0.5 } },
      ],
      o: ["c1", "c2"],
    }),
  )}`

// page.goto(BOOK_SCREEN_URL) を、そのとき常駐に在る最初のブックを開いたブックスクリーンの URL へ行かせる（窓はブックスクリーン 0 枚で始まるため）
export function startingAtFirstBook<P extends Page>(page: P): P {
  const goto = page.goto.bind(page)
  page.goto = (async (url, options) => {
    if (url !== BOOK_SCREEN_URL) return goto(url, options)
    const first = (await storedBooks(page.request))[0] as { id: string } | undefined
    return goto(bookScreenUrl(first?.id ?? null), options)
  }) as Page["goto"]
  return page
}
export const CONTROL_CENTER_URL = "/?f=center"

// URL に書かれた画面の場所（host-client/location.ts の sc の値。無ければ null）
export interface UrlPlace {
  s: { i: string; d: string; p?: unknown; t?: Record<string, unknown>; g?: { l: UrlStage[]; c: number; r: number } }[]
  o: string[]
  w?: Record<string, unknown>
}
export interface UrlStage {
  b: string | null
  p?: string
  v: [number, number, number]
  s?: Record<string, unknown>
}
export const urlPlace = (page: { url(): string }): UrlPlace | null =>
  JSON.parse(new URL(page.url()).searchParams.get("sc") ?? "null")
// URL の、カレントスクリーンの定義の id
export const urlCurrentScreen = (page: { url(): string }): string | undefined => {
  const place = urlPlace(page)
  return place?.s.find(x => x.i === place.o.at(-1))?.d
}
// URL の、いちばん最近カレントにしたブックスクリーンのステージの並び（左から）
export const urlStages = (page: { url(): string }): UrlStage[] => {
  const place = urlPlace(page)
  const recent = [...(place?.o ?? [])].reverse().find(id => place?.s.find(x => x.i === id)?.g)
  return place?.s.find(x => x.i === recent)?.g?.l ?? []
}
export const CONTROL_CENTER_SCREEN_DEF = "@matomezu/control-center:screen"
export const BOOK_SCREEN_DEF = "@matomezu/base:book-screen"

// ブラウザ（context）を常駐の画面 cookie を持たせる（テストの用意の口でコードをもらい、本物の /cookie を通って cookie を受け取る）
const giveCookie = async (host: Host, context: BrowserContext) => {
  const made = await fetch(`${host.url}/api/cookie-code-for-test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  })
  if (!made.ok) throw new Error(`cookie-code-for-test: ${made.status} ${await made.text()}`)
  const { code } = (await made.json()) as { code: string }
  const done = await context.request.get(`${host.url}/cookie?code=${code}`)
  if (!done.ok()) throw new Error(`cookie: ${done.status()}`)
}

export const test = base.extend<
  {
    books: readonly object[]
    enabledPlugins: readonly string[]
    reset: undefined
    withCookie: undefined
    newPage: () => Promise<Page>
  },
  HostOptions & { host: Host }
>({
  // 常駐の serve に足す引数（追加プラグインのフォルダを結ぶ --plugin など）
  hostArgs: [[], { option: true, scope: "worker" }],
  // 有効にしておく追加プラグインの id（足した追加プラグインは、利用者が有効にするまで無効）
  enabledPlugins: [[], { option: true }],
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
      // 画面の入口は画面 cookie を持つブラウザにしか答えないので、合言葉の入口（/api/ping）で確かめる
      const answering = async (url: string, token: string) =>
        fetch(`${url}/api/ping`, { headers: { Authorization: `Bearer ${token}` } }).then(
          r => r.ok,
          () => false,
        )
      for (;;) {
        if (serve.exitCode !== null) throw new Error(`matomezu serve stopped (${serve.exitCode})`)
        const server = serverIn(home)
        const url = server && server.pid === serve.pid ? server.url.replace(/\/$/, "") : undefined
        if (url && server && (await answering(url, server.token))) {
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
  books: [SAMPLE_BOOKS, { option: true }],
  // テストごとのブラウザ（context）を、常駐の画面 cookie を持たせる
  withCookie: [
    async ({ host, context }, use) => {
      await giveCookie(host, context)
      await use(undefined)
    },
    { auto: true },
  ],
  // 別のブラウザ（画面 cookie を持つ新しい窓）を開く。複数の窓を使うテストが、browser.newPage() の代わりに使う
  newPage: async ({ host, browser }, use) => {
    await use(async () => {
      const context = await browser.newContext()
      await giveCookie(host, context)
      return startingAtFirstBook(await context.newPage())
    })
  },
  page: async ({ page }, use) => use(startingAtFirstBook(page)),
  reset: [
    async ({ host, books, enabledPlugins }, use) => {
      const done = await fetch(`${host.url}/api/reset-for-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ books, enabledPlugins }),
      })
      if (!done.ok) throw new Error(`reset-for-test: ${done.status} ${await done.text()}`)
      await use(undefined)
    },
    { auto: true },
  ],
})
