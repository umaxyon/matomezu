import { expect, test } from "bun:test"
import type { BookOf } from "../../web/src/core/schema/book"
import { type Events, NoServer, serverClient } from "../../web/src/host-client/server"
import { SAMPLE_BOOKS } from "../../web/src/sample-books"
import { newStore } from "../support"

// 常駐の代わり: 送られたアクションを覚え、知らせ（emit）を手で送る
function fakeServer(data: unknown = { books: [{ id: "b1", book: SAMPLE_BOOKS[0], version: 1 }], settings: null }) {
  const sent: Record<string, unknown>[] = []
  const listeners = new Map<string, (data: string) => void>()
  let onError = () => {}
  let reads = 0
  let focus = () => {}
  let reloads = 0
  const events: Events = {
    on: (name, l) => listeners.set(name, l),
    onError: l => {
      onError = l
    },
    close: () => {},
  }
  const host = serverClient({
    fetch: async (url, init) => {
      if (url === "api/perform" || url === "api/view" || url === "api/notices")
        sent.push({ url, ...JSON.parse(String(init?.body)) })
      if (url === "api/data") reads++
      return new Response(JSON.stringify(data))
    },
    events: () => events,
    focused: () => true,
    onFocus: l => {
      focus = l
      return () => {}
    },
    importModule: async url => ({ default: { id: url } }),
    addStyle: () => {},
    reload: () => {
      reloads++
    },
  })
  const emit = (name: string, v: unknown) => listeners.get(name)?.(JSON.stringify(v))
  return { host, sent, emit, fail: () => onError(), reads: () => reads, focus: () => focus(), reloads: () => reloads }
}

// 常駐から読んで作った store。最初の知らせ hello を先に送る
async function connected(server = fakeServer()) {
  const loading = server.host.load()
  server.emit("hello", { client: "c1" })
  const saved = await loading
  const store = newStore({ books: [], savedBooks: saved.books, observe: d => server.host.observe(d) })
  server.host.connect(store)
  return { ...server, store }
}
const itemsOf = (store: ReturnType<typeof newStore>) =>
  (store.state.getState().books.b1 as BookOf<"@matomezu/drawing:drawing">).pages[0]!.items?.map(i => i.id) ?? []
const place = (store: ReturnType<typeof newStore>) =>
  store.actions.perform(
    "@matomezu/paper:item-place",
    { page: "p1", item: "@matomezu/box:shape-box", at: { x: 0, y: 0 } },
    { book: "b1" },
  )
// 常駐が知らせる、アイテムを足した b1
const b1With = (...ids: string[]) => ({
  ...SAMPLE_BOOKS[0],
  pages: [
    {
      ...SAMPLE_BOOKS[0]!.pages[0],
      items: ids.map(id => ({ id, item: "@matomezu/box:shape-box", x: 0, y: 0, props: {} })),
    },
  ],
})

test("知らせにつながらなければ NoServer", async () => {
  const s = fakeServer()
  const loading = s.host.load()
  s.fail()
  await expect(loading).rejects.toBeInstanceOf(NoServer)
})

test("読むと、置いてあるブックと設定を返す", async () => {
  const s = fakeServer({ books: [{ id: "b1", book: SAMPLE_BOOKS[0], version: 1 }], settings: { lang: "en" } })
  const loading = s.host.load()
  s.emit("hello", { client: "c1" })
  expect(await loading).toEqual({ books: [SAMPLE_BOOKS[0]], settings: { lang: "en" }, plugins: [], failed: [] })
})

test("常駐が足した追加プラグインは、見た目の JS を読んで default で出したものを返し、CSS を読む。読み込めない物は外して理由を返す", async () => {
  const styles: string[] = []
  const imported: string[] = []
  const listeners = new Map<string, (data: string) => void>()
  const host = serverClient({
    fetch: async () =>
      new Response(
        JSON.stringify({
          books: [],
          settings: null,
          plugins: [
            { id: "a", ui: "api/plugins/0/ui.js", css: "api/plugins/0/ui.css" },
            { id: "b", ui: "api/plugins/1/ui.js" },
            { id: "c", ui: "api/plugins/2/ui.js", css: "api/plugins/2/ui.css" },
          ],
        }),
      ),
    events: () => ({ on: (name, l) => listeners.set(name, l), onError: () => {}, close: () => {} }),
    focused: () => false,
    onFocus: () => () => {},
    importModule: async url => {
      imported.push(url)
      if (url === "api/plugins/2/ui.js") throw new Error("broken")
      return { default: { id: url } }
    },
    addStyle: url => styles.push(url),
    reload: () => {},
  })
  const loading = host.load()
  listeners.get("hello")?.(JSON.stringify({ client: "c1" }))
  const loaded = await loading
  // 読み込めない c は外して理由を返し、ほかは読む（c の CSS は足さない）
  expect(loaded.plugins).toEqual([{ id: "api/plugins/0/ui.js" }, { id: "api/plugins/1/ui.js" }])
  expect(loaded.failed).toMatchObject([{ id: "c", error: { message: "broken" } }])
  expect(imported).toEqual(["api/plugins/0/ui.js", "api/plugins/1/ui.js", "api/plugins/2/ui.js"])
  expect(styles).toEqual(["api/plugins/0/ui.css"])
})

test("追加プラグインが変わったと届いたら、画面を読み直す", async () => {
  const { emit, reloads } = await connected()
  expect(reloads()).toBe(0)
  emit("plugins", { version: 1 })
  expect(reloads()).toBe(1)
})

test("画面で行ったアクションは、振った id と、つながりの id と順の番号を添えて常駐に送る", async () => {
  const { store, sent } = await connected()
  sent.length = 0
  place(store)
  place(store)
  expect(sent.filter(x => x.url === "api/perform")).toEqual([
    expect.objectContaining({
      action: "@matomezu/paper:item-place",
      on: { book: "b1" },
      ids: ["n1"],
      lang: "ja",
      client: "c1",
      seq: 1,
    }),
    expect.objectContaining({ ids: ["n2"], seq: 2 }),
  ])
})

test("ほかから変わったブックの上で、まだ確かめられていない自分のアクションを行い直す。自分の番号が返ると確かめ終わり", async () => {
  const { store, emit, host } = await connected()
  place(store)
  expect(itemsOf(store)).toEqual(["n1"])
  emit("book", { book: b1With("o1"), version: 2, client: "c2", seq: 5 })
  expect(itemsOf(store)).toEqual(["o1", "n1"])
  expect(host.pending()).toHaveLength(1)
  emit("book", { book: b1With("o1", "n1"), version: 3, client: "c1", seq: 1 })
  expect(itemsOf(store)).toEqual(["o1", "n1"])
  expect(host.pending()).toEqual([])
})

test("古い版の知らせは使わない", async () => {
  const { store, emit } = await connected()
  emit("book", { book: b1With("x"), version: 3 })
  emit("book", { book: b1With("old"), version: 2 })
  expect(itemsOf(store)).toEqual(["x"])
})

test("断られた（ack で確かめ終わり、変わったブックが来ない）アクションは画面から消える", async () => {
  const { store, emit } = await connected()
  place(store)
  emit("ack", { seq: 1, ok: false, reason: "refused" })
  expect(itemsOf(store)).toEqual([])
})

test("つなぎ直したら（2 度目の hello）、送ったアクションの答えを待たず、読み直した世界を出す", async () => {
  const s = await connected()
  place(s.store)
  s.emit("hello", { client: "c9" })
  await Bun.sleep(0)
  expect(s.reads()).toBe(2)
  expect(s.host.pending()).toEqual([])
  expect(itemsOf(s.store)).toEqual([])
})

test("設定の知らせで設定を入れ替える", async () => {
  const { store, emit } = await connected()
  emit("settings", { settings: { lang: "en", skin: "@matomezu/base:dark" } })
  expect(store.state.getState().settings).toMatchObject({ lang: "en", skin: "@matomezu/base:dark" })
})

test("読んでいる間に届いた新しい版の知らせは、読んだ古い版で消さない", async () => {
  let answer = (_: Response) => {}
  const listeners = new Map<string, (data: string) => void>()
  const host = serverClient({
    fetch: () => new Promise<Response>(r => (answer = r)),
    events: () => ({ on: (name, l) => listeners.set(name, l), onError: () => {}, close: () => {} }),
    focused: () => false,
    onFocus: () => () => {},
    importModule: async () => ({}),
    addStyle: () => {},
    reload: () => {},
  })
  const loading = host.load()
  listeners.get("hello")?.(JSON.stringify({ client: "c1" }))
  await Bun.sleep(0)
  listeners.get("book")?.(JSON.stringify({ book: b1With("new"), version: 3 }))
  answer(new Response(JSON.stringify({ books: [{ id: "b1", book: b1With("old"), version: 2 }], settings: null })))
  expect((await loading).books).toEqual([b1With("new")])
})

test("窓が見ているものと、窓がフォーカスされたことを、増やす番号を付けて知らせる。変わらなければ知らせない", async () => {
  const s = await connected()
  const view = (selection: string[]) => ({
    book: "b1",
    page: "p1",
    selection,
    stage: "s1",
    stages: [{ id: "s1", book: "b1", page: "p1" }],
    canSplit: true,
  })
  expect(s.sent).toEqual([{ url: "api/view", client: "c1", view: view([]), focused: true, seq: 1 }])
  s.store.actions.select("s1", ["x"])
  s.store.actions.resizeStage("s1", { w: 100, h: 100 })
  s.focus()
  expect(s.sent.slice(1)).toEqual([
    { url: "api/view", client: "c1", view: view(["x"]), focused: false, seq: 2 },
    { url: "api/view", client: "c1", view: view(["x"]), focused: true, seq: 3 },
  ])
})

test("分けた窓は、ステージごとに見ているものを知らせ、もう分けられない", async () => {
  const s = await connected()
  s.store.actions.split("s1")
  expect(s.sent.at(-1)?.view).toEqual({
    book: "b1",
    page: "p1",
    selection: [],
    stage: "s1",
    stages: [
      { id: "s1", book: "b1", page: "p1" },
      { id: "s2", book: null, page: null },
    ],
    canSplit: false,
  })
})

test("show が届いたら、言われたステージでブックを開き、カレントにする", async () => {
  const s = await connected()
  s.store.actions.split("s1")
  s.emit("show", { book: "b1", stage: "s2" })
  const ws = s.store.state.getState().workspace
  expect(ws.current).toBe("s2")
  expect(ws.stages.map(st => st.opened?.book ?? null)).toEqual(["b1", "b1"])
})

test("show の split は、そのステージを分けて右にできたステージに開く", async () => {
  const s = await connected()
  s.emit("show", { book: "b1", split: true })
  const ws = s.store.state.getState().workspace
  expect(ws.stages.map(st => st.id)).toEqual(["s1", "s2"])
  expect(ws.current).toBe("s2")
  expect(ws.stages[1]?.opened?.book).toBe("b1")
})

test("画面が見つけた注意は、つながりの id を添えて常駐に知らせ、つなぎ直すたびに知らせ直す", async () => {
  const { host, sent, emit } = await connected()
  const n011 = { code: "N011" as const, plugin: "acme", params: { reason: "E301" } }
  host.reportNotices([n011])
  emit("hello", { client: "c2" })
  await Promise.resolve()
  expect(sent.filter(x => x.url === "api/notices")).toEqual([
    { url: "api/notices", client: "c1", notices: [n011] },
    { url: "api/notices", client: "c2", notices: [n011] },
  ])
})

test("ブックに触れた時刻は、読んだ一覧と touched の知らせで持ち、store に入れる（古い知らせでは戻さない）", async () => {
  const server = fakeServer({
    books: [{ id: "b1", book: SAMPLE_BOOKS[0], version: 1 }],
    settings: null,
    touched: { b1: "2026-10-27T01:00:00Z" },
  })
  const { store, emit } = await connected(server)
  expect(store.state.getState().touched).toEqual({ b1: "2026-10-27T01:00:00Z" })
  emit("touched", { book: "master", at: "2026-10-27T02:00:00Z" })
  emit("touched", { book: "b1", at: "2026-10-27T00:00:00Z" })
  expect(store.state.getState().touched).toEqual({ b1: "2026-10-27T01:00:00Z", master: "2026-10-27T02:00:00Z" })
})
