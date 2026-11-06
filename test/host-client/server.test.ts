import { expect, test } from "bun:test"
import type { BookOf } from "../../web/src/core/schema/book"
import { type Events, NoServer, OFFLINE_MS, QUIET_MS, serverClient } from "../../web/src/host-client/server"
import { SAMPLE_BOOKS } from "../sample-books"
import { newStore } from "../support"

// 常駐の代わり: 送られたアクションを覚え、知らせ（emit）を手で送る。perform はアクションを送られたときの答え（null は送れない）、
// read は読まれたときの答えの status、log はログを送られたときの答えの status、data は読まれたときに返す世界。待ち（later）は tick で進める。
// 知らせのつながりは、つなぐたびに新しく作り（opened は作った数、closed は閉じた数）、emit と fail は最後に作ったつながりに送る
function fakeServer(data: unknown = { books: [{ id: "b1", book: SAMPLE_BOOKS[0], version: 1 }], settings: null }) {
  const sent: Record<string, unknown>[] = []
  const answer: { perform: () => number | null; read: () => number; log: () => number; data: unknown } = {
    perform: () => 200,
    read: () => 200,
    log: () => 200,
    data,
  }
  let timers: { run: () => void; ms: number }[] = []
  const made = new Map<number, number>() // 待ちの長さ → 作った数
  let clock = 0 // 壁時計（待ちとは別に、pass で進める。スリープの間に待ちが進まないのを真似る）
  let keys = 0
  let listeners = new Map<string, (data: string) => void>()
  let onError = () => {}
  let opened = 0
  let closed = 0
  let reads = 0
  let focus = () => {}
  let reloads = 0
  const events = (): Events => {
    const mine = new Map<string, (data: string) => void>()
    listeners = mine
    opened++
    return {
      on: (name, l) => mine.set(name, l),
      onError: l => {
        if (listeners === mine) onError = l
      },
      close: () => {
        closed++
      },
    }
  }
  const host = serverClient({
    fetch: async (url, init) => {
      if (url === "api/perform" || url === "api/view" || url === "api/warnings" || url === "api/log")
        sent.push({ url, ...JSON.parse(String(init?.body)) })
      if (url === "api/data") reads++
      if (url === "api/perform") {
        const status = answer.perform()
        if (status === null) throw new TypeError("Failed to fetch")
        return new Response("{}", { status })
      }
      const status = url === "api/data" ? answer.read() : url === "api/log" ? answer.log() : 200
      return new Response(JSON.stringify(answer.data), { status })
    },
    events,
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
    later: (run, ms) => {
      made.set(ms, (made.get(ms) ?? 0) + 1)
      const timer = { run, ms }
      timers.push(timer)
      return () => {
        timers = timers.filter(t => t !== timer)
      }
    },
    newKey: () => `k${++keys}`,
    now: () => clock,
  })
  const emit = (name: string, v: unknown) => listeners.get(name)?.(JSON.stringify(v))
  // ms 以下の待ちを全部進める（黙って切れたとみる QUIET_MS の待ちは、言われたときだけ）
  const tick = (ms = QUIET_MS - 1) => {
    const due = timers.filter(t => t.ms <= ms)
    timers = timers.filter(t => t.ms > ms)
    for (const t of due) t.run()
  }
  const performs = () => sent.filter(x => x.url === "api/perform")
  // 常駐のログに送った行（窓の id と文）
  const logged = () =>
    sent.filter(x => x.url === "api/log").flatMap(x => (x.lines as { text: string }[]).map(l => [x.client, l.text]))
  return {
    host,
    sent,
    answer,
    performs,
    logged,
    emit,
    tick,
    fail: () => onError(),
    reads: () => reads,
    opened: () => opened,
    closed: () => closed,
    waiting: (ms: number) => timers.filter(t => t.ms === ms).length,
    scheduled: (ms: number) => made.get(ms) ?? 0,
    pass: (ms: number) => {
      clock += ms
    },
    focus: () => focus(),
    reloads: () => reloads,
  }
}
// 送る・読むのを済ませる
const flush = () => Bun.sleep(1)

// 常駐から読んで作った store。最初の知らせ hello を先に送る
async function connected(server = fakeServer()) {
  const loading = server.host.load()
  server.emit("hello", { client: "c1" })
  const saved = await loading
  const store = newStore({ books: [], savedBooks: saved.books, observe: d => server.host.observe(d) })
  const stop = server.host.connect(store)
  return { ...server, store, stop }
}
const itemsOf = (store: ReturnType<typeof newStore>) =>
  (store.state.getState().books.b1 as BookOf<"@matomezu/drawing:drawing">).pages[0]!.items?.map(i => i.id) ?? []
const place = (store: ReturnType<typeof newStore>) =>
  store.actions.perform(
    "@matomezu/paper:item-place",
    { page: "p1", item: "@matomezu/box:shape-nest-box", at: { x: 0, y: 0 }, crowd: "push" },
    { book: "b1" },
  )
// 常駐が知らせる、アイテムを足した b1
const b1With = (...ids: string[]) => ({
  ...SAMPLE_BOOKS[0],
  pages: [
    {
      ...SAMPLE_BOOKS[0]!.pages[0],
      items: ids.map(id => ({ id, item: "@matomezu/box:shape-nest-box", x: 0, y: 0, props: {} })),
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
    later: () => () => {},
    newKey: () => "k",
    now: () => 0,
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
  await flush()
  expect(sent.filter(x => x.url === "api/perform")).toEqual([
    expect.objectContaining({
      action: "@matomezu/paper:item-place",
      on: { book: "b1" },
      ids: ["n1"],
      lang: "ja",
      client: "c1",
      seq: 1,
      key: "k1",
    }),
    expect.objectContaining({ ids: ["n2"], seq: 2, key: "k2" }),
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

test("ゴミ箱に入ったブックはゴミ箱へ分け、消したと届いたブックは一覧から外れる", async () => {
  const { store, emit } = await connected()
  emit("book", { book: { ...b1With(), trashed: "2026-10-29T00:00:00.000Z" }, version: 2 })
  expect("b1" in store.state.getState().books).toBe(false)
  expect(store.state.getState().trash.b1?.trashed).toBe("2026-10-29T00:00:00.000Z")
  emit("removed", { book: "b1" })
  expect("b1" in store.state.getState().trash).toBe(false)
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

test("つなぎ直したら（2 度目の hello）、読み直した世界の上に確かめられていないアクションを出し、新しいつながりで同じ番号で送り直す", async () => {
  const s = await connected()
  place(s.store)
  await flush()
  s.fail()
  s.emit("hello", { client: "c9" })
  await flush()
  expect(s.reads()).toBe(2)
  expect(itemsOf(s.store)).toEqual(["n1"])
  expect(s.performs().map(p => [p.client, p.seq, p.key])).toEqual([
    ["c1", 1, "k1"],
    ["c9", 1, "k1"],
  ])
  s.emit("ack", { seq: 1, ok: true })
  expect(s.host.pending()).toEqual([])
})

test("常駐を起動し直して、つなぎ直した窓の id が前と同じでも、答えの来なかったアクションを送り直す", async () => {
  const s = await connected()
  place(s.store)
  await flush()
  s.fail()
  s.emit("hello", { client: "c1" })
  await flush()
  expect(s.performs().map(p => [p.client, p.seq, p.key])).toEqual([
    ["c1", 1, "k1"],
    ["c1", 1, "k1"],
  ])
})

test("つなぎ直したときに読めなければ、少し待って読み直し、その間に変わったブックも出す", async () => {
  const s = await connected()
  s.fail()
  s.answer.read = () => 404
  s.emit("hello", { client: "c2" })
  await flush()
  expect(s.reads()).toBe(2)
  expect(itemsOf(s.store)).toEqual([])
  s.answer.read = () => 200
  s.answer.data = { books: [{ id: "b1", book: b1With("later"), version: 5 }], settings: null }
  s.tick()
  await flush()
  expect(s.reads()).toBe(3)
  expect(itemsOf(s.store)).toEqual(["later"])
  expect(s.logged().map(l => l[1])).toEqual([
    "lost the connection to the server",
    "reconnected as c2 (was c1): sending 0 actions again",
    "could not read the server again: NoServer",
    "took book b1 v5; the window had v1",
  ])
})

test("つなぎ直して読み直すと、常駐に無くなったブックは消える。読んでいる間に届いたブックは残す", async () => {
  const s = await connected()
  s.answer.data = { books: [], settings: null }
  s.fail()
  s.emit("hello", { client: "c2" })
  await flush()
  expect("b1" in s.store.state.getState().books).toBe(false)
  expect(s.logged().map(l => l[1])).toContain("removed book b1; the server does not have it")
  s.emit("book", { book: b1With("x"), version: 7 })
  s.fail()
  s.emit("hello", { client: "c3" })
  s.emit("book", { book: b1With("y"), version: 8 })
  await flush()
  expect(itemsOf(s.store)).toEqual(["y"])
})

test("送れなかったアクションは消さず、切れている間の編集とまとめて、つながったら順に送る", async () => {
  const s = await connected()
  s.answer.perform = () => null
  place(s.store)
  await flush()
  s.fail()
  place(s.store)
  await flush()
  expect(s.performs()).toHaveLength(1) // 切れている間は送らない
  expect(itemsOf(s.store)).toEqual(["n1", "n2"])
  s.answer.perform = () => 200
  s.emit("hello", { client: "c2" })
  await flush()
  expect(
    s
      .performs()
      .slice(1)
      .map(p => [p.client, p.seq, p.key]),
  ).toEqual([
    ["c2", 1, "k1"],
    ["c2", 2, "k2"],
  ])
})

test("常駐が 5xx を返したアクションは、しばらくして送り直し、何度も返したら外してトーストで知らせる", async () => {
  const s = await connected()
  s.answer.perform = () => 500
  place(s.store)
  await flush()
  s.tick()
  await flush()
  expect(s.performs()).toHaveLength(2)
  expect(s.host.pending()).toHaveLength(1)
  s.tick()
  await flush()
  expect(s.performs()).toHaveLength(3)
  expect(s.host.pending()).toEqual([])
  expect(itemsOf(s.store)).toEqual([])
  expect(s.store.state.getState().toasts).toMatchObject([{ kind: "warn", message: "An edit could not be saved" }])
})

test("断られたアクションは、つなぎ直しても送り直さない", async () => {
  const s = await connected()
  place(s.store)
  await flush()
  s.emit("ack", { seq: 1, ok: false, reason: "refused" })
  s.fail()
  s.emit("hello", { client: "c2" })
  await flush()
  expect(s.performs()).toHaveLength(1)
})

test("つながりが長く切れたままなら store に知らせ、つながったら戻す（一瞬切れただけなら知らせない）", async () => {
  const s = await connected()
  s.fail()
  s.emit("hello", { client: "c2" })
  s.tick()
  expect(s.store.state.getState().offline).toBe(false)
  s.fail()
  s.tick(OFFLINE_MS)
  expect(s.store.state.getState().offline).toBe(true)
  s.emit("hello", { client: "c3" })
  expect(s.store.state.getState().offline).toBe(false)
})

test("設定の知らせで設定を入れ替える", async () => {
  const { store, emit } = await connected()
  emit("settings", { settings: { lang: "en", skin: "@matomezu/base:dark" } })
  expect(store.state.getState().settings).toMatchObject({ lang: "en", skin: "@matomezu/base:dark" })
})

test("アノテーションの知らせで、そのブックのアノテーションを入れ替える（空の並びなら無くす）", async () => {
  const { store, emit } = await connected()
  const list = [{ id: "c1", annotation: "@matomezu/base:note", anchors: ["x"], props: {} }]
  emit("annotations", { book: "b1", annotations: list })
  expect(store.state.getState().annotations).toEqual({ b1: list })
  emit("annotations", { book: "b1", annotations: [] })
  expect(store.state.getState().annotations).toEqual({})
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
    later: () => () => {},
    newKey: () => "k",
    now: () => 0,
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
    mode: "edit",
    selection,
    stage: "s1",
    stages: [{ id: "s1", book: "b1", page: "p1", mode: "edit" }],
    canSplit: true,
  })
  expect(s.sent).toEqual([{ url: "api/view", client: "c1", view: view([]), editLocks: {}, focused: true, seq: 1 }])
  s.store.actions.select("s1", ["x"])
  s.store.actions.resizeStage("s1", { w: 100, h: 100 })
  s.focus()
  expect(s.sent.slice(1)).toEqual([
    { url: "api/view", client: "c1", view: view(["x"]), editLocks: {}, focused: false, seq: 2 },
    { url: "api/view", client: "c1", view: view(["x"]), editLocks: {}, focused: true, seq: 3 },
  ])
})

test("利用者が直している物（useEditLock）を、ブックごとにまとめて見ているものと一緒に知らせる。まとめた物が変わったときだけ知らせ、全部外したら空で知らせる", async () => {
  const s = await connected()
  s.store.setEditLock("a", { book: "b1", ids: ["n1"] })
  s.store.setEditLock("b", { book: "b1", ids: ["n1", "n2"] })
  expect(s.sent.at(-1)).toMatchObject({ editLocks: { b1: ["n1", "n2"] }, seq: 3 })
  s.store.setEditLock("a", { book: "b1", ids: ["n1"] })
  expect(s.sent).toHaveLength(3)
  // 外しても、まとめた物が変わらなければ知らせない
  s.store.setEditLock("a", null)
  expect(s.sent).toHaveLength(3)
  s.store.setEditLock("b", null)
  expect(s.sent.at(-1)).toMatchObject({ editLocks: {}, seq: 4 })
})

test("分けた窓は、ステージごとに見ているものを知らせ、もう分けられない", async () => {
  const s = await connected()
  s.store.actions.split("s1")
  expect(s.sent.at(-1)?.view).toEqual({
    book: "b1",
    page: "p1",
    mode: "edit",
    selection: [],
    stage: "s1",
    stages: [
      { id: "s1", book: "b1", page: "p1", mode: "edit" },
      { id: "s2", book: null, page: null, mode: "edit" },
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

test("show の mode が print-preview なら、印刷プレビューで開く", async () => {
  const s = await connected()
  s.emit("show", { book: "b1", mode: "print-preview" })
  expect(s.store.state.getState().workspace.stages[0]?.mode.kind).toBe("print-preview")
  expect(s.sent.at(-1)?.view).toMatchObject({ mode: "print-preview" })
})

test("show の split は、そのステージを分けて右にできたステージに開く", async () => {
  const s = await connected()
  s.emit("show", { book: "b1", split: true })
  const ws = s.store.state.getState().workspace
  expect(ws.stages.map(st => st.id)).toEqual(["s1", "s2"])
  expect(ws.current).toBe("s2")
  expect(ws.stages[1]?.opened?.book).toBe("b1")
})

test("画面が見つけた warning は、つながりの id を添えて常駐に知らせ、つなぎ直すたびに知らせ直す", async () => {
  const { host, sent, emit } = await connected()
  const w011 = { code: "W011" as const, plugin: "acme", params: { reason: "E301" } }
  host.reportWarnings([w011])
  emit("hello", { client: "c2" })
  await Promise.resolve()
  expect(sent.filter(x => x.url === "api/warnings")).toEqual([
    { url: "api/warnings", client: "c1", warnings: [w011] },
    { url: "api/warnings", client: "c2", warnings: [w011] },
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

test("切れている間に書き残した事は、つなぎ直してから新しいつながりの id で常駐のログに送る", async () => {
  const s = await connected()
  s.fail()
  expect(s.logged()).toEqual([])
  s.emit("hello", { client: "c2" })
  await flush()
  expect(s.logged()).toEqual([
    ["c2", "lost the connection to the server"],
    ["c2", "reconnected as c2 (was c1): sending 0 actions again"],
  ])
})

test("常駐のログに送れない（5xx）行は、つなぎ直したときに一緒に送る。4xx なら捨てる。読み直した版が画面の版より古ければ画面の版を残す", async () => {
  const s = await connected()
  s.answer.log = () => 400
  s.emit("book", { book: b1With("x"), version: 3 })
  s.emit("book", { book: b1With("x"), version: 1 })
  s.answer.log = () => 500
  s.emit("book", { book: b1With("old"), version: 2 })
  await flush()
  s.answer.log = () => 200
  s.fail()
  s.emit("hello", { client: "c2" })
  await flush()
  expect(itemsOf(s.store)).toEqual(["x"])
  expect(s.logged().slice(2)).toEqual([
    ["c2", "kept book b1 v3; the notice had v2"],
    ["c2", "lost the connection to the server"],
    ["c2", "reconnected as c2 (was c1): sending 0 actions again"],
    ["c2", "kept book b1 v3; the server has v1"],
  ])
})

test("知らせが QUIET_MS 届かなければ、黙って切れたとみて閉じてつなぎ直し、読み直してアクションを送り直す", async () => {
  const s = await connected()
  s.answer.perform = () => null
  place(s.store)
  await flush()
  s.answer.perform = () => 200
  s.answer.data = { books: [{ id: "b1", book: b1With("ai"), version: 2 }], settings: null }
  s.tick(QUIET_MS)
  expect([s.opened(), s.closed()]).toEqual([2, 1])
  // つなぎ直したつながりが hello を返さなければ、また閉じてつなぎ直す（ログは 1 度だけ）
  s.tick(QUIET_MS)
  expect([s.opened(), s.closed()]).toEqual([3, 2])
  s.emit("hello", { client: "c2" })
  await flush()
  expect(s.reads()).toBe(2)
  expect(itemsOf(s.store)).toEqual(["ai", "n1"])
  expect(s.performs().map(p => p.client)).toEqual(["c1", "c2"])
  expect(s.logged().map(l => l[1])).toEqual([
    "no event for 60s; connecting again",
    "reconnected as c2 (was c1): sending 1 actions again",
    "took book b1 v2; the window had v1",
  ])
})

test("keep などの知らせが届くたびに、黙って切れたとみるまでの待ちを始め直す", async () => {
  const s = await connected()
  expect([s.scheduled(QUIET_MS), s.waiting(QUIET_MS)]).toEqual([1, 1])
  s.emit("keep", {})
  s.emit("keep", {})
  expect([s.scheduled(QUIET_MS), s.waiting(QUIET_MS)]).toEqual([3, 1])
  expect(s.opened()).toBe(1)
  // 止めると見張りも止まる
  s.stop()
  expect(s.waiting(QUIET_MS)).toBe(0)
})

test("つなぎ直したら、見ているものを新しいつながりの id で知らせ直す", async () => {
  const s = await connected()
  s.fail()
  s.emit("hello", { client: "c2" })
  await flush()
  expect(s.sent.filter(x => x.url === "api/view").map(x => x.client)).toEqual(["c1", "c2"])
})

test("フォーカスされたとき、壁時計で QUIET_MS 何も届いていなければ、待ちを待たずにつなぎ直す", async () => {
  const s = await connected()
  s.pass(QUIET_MS - 1)
  s.focus()
  expect(s.opened()).toBe(1)
  s.emit("keep", {})
  s.pass(QUIET_MS)
  s.focus()
  expect([s.opened(), s.closed()]).toEqual([2, 1])
  expect(s.logged().map(l => l[1])).toEqual([])
  s.emit("hello", { client: "c2" })
  await flush()
  expect(s.reads()).toBe(2)
  expect(s.logged().map(l => l[1])).toEqual([
    "no event for 60s by the clock; connecting again",
    "reconnected as c2 (was c1): sending 0 actions again",
  ])
})
