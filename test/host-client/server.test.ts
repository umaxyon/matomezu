import { expect, test } from "bun:test"
import { pagesOf } from "../../web/src/core/book"
import { HOME_ID, recordsOf, TRASH_ID } from "../../web/src/core/folders"
import type { Book } from "../../web/src/core/schema/book"
import { screenOf } from "../../web/src/core/window"
import { type Events, NoServer, OFFLINE_MS, QUIET_MS, serverClient } from "../../web/src/host-client/server"
import { drawingPage, testBook } from "../lineup"
import { SAMPLE_BOOKS } from "../sample-books"
import { newStore, showCenter } from "../support"

// 常駐が読まれたときに返すページとフォルダ: ブック books を分けた物（版は versions の id ごと。無ければ 1）
const dataOf = (books: readonly Book[], versions: Readonly<Record<string, number>> = {}) => ({
  pages: books.flatMap(b => recordsOf(b).pages).map(page => ({ id: page.id, page, version: versions[page.id] ?? 1 })),
  folders: books
    .flatMap(b => recordsOf(b).folders)
    .map(folder => ({ id: folder.id, folder, version: versions[folder.id] ?? 1 })),
})
// 知らせに添える、行った窓と順の番号
type Mark = { client?: string; seq?: number }
// ブック book のページ id だけが版 version に変わった知らせ（フォルダは変わらない）
const pageChangedOf = (book: Book, id: string, version: number, mark: Mark = {}) => ({
  pages: recordsOf(book)
    .pages.filter(page => page.id === id)
    .map(page => ({ id, page, version })),
  folders: [],
  books: [book.id],
  ...mark,
})
// ブック book のページとフォルダの全部が版 version に変わった知らせ
const changedOf = (book: Book, version: number, mark: Mark = {}) => ({
  pages: recordsOf(book).pages.map(page => ({ id: page.id, page, version })),
  folders: recordsOf(book).folders.map(folder => ({ id: folder.id, folder, version })),
  books: [book.id],
  ...mark,
})
// ブック book のページとフォルダの全部を消した知らせ
const removedOf = (book: Book) => ({
  pages: recordsOf(book).pages.map(page => ({ id: page.id, removed: true })),
  folders: recordsOf(book).folders.map(folder => ({ id: folder.id, removed: true })),
  books: [book.id],
})

// 常駐の代わり: 送られたアクションを覚え、知らせ（emit）を手で送る。perform はアクションを送られたときの答え（null は送れない）、
// read は読まれたときの答えの status、log はログを送られたときの答えの status、data は読まれたときに返す世界。待ち（later）は tick で進める。
// 知らせのつながりは、つなぐたびに新しく作り（opened は作った数、closed は閉じた数）、emit と fail は最後に作ったつながりに送る
function fakeServer(data: unknown = { ...dataOf([SAMPLE_BOOKS[0]!]), settings: null }) {
  const sent: Record<string, unknown>[] = []
  const answer: {
    perform: () => number | null
    read: () => number
    log: () => number
    tickets: () => number | null
    data: unknown
  } = {
    perform: () => 200,
    read: () => 200,
    log: () => 200,
    tickets: () => 200,
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
      if (
        url === "api/perform" ||
        url === "api/view" ||
        url === "api/warnings" ||
        url === "api/log" ||
        url === "api/ai-edit-tickets"
      )
        sent.push({ url, ...JSON.parse(String(init?.body)) })
      if (url === "api/data") reads++
      if (url === "api/ai-edit-tickets") {
        const status = answer.tickets()
        if (status === null) throw new TypeError("Failed to fetch")
        return new Response("{}", { status })
      }
      if (url === "api/perform") {
        const status = answer.perform()
        if (status === null) throw new TypeError("Failed to fetch")
        return new Response("{}", { status })
      }
      const status = url === "api/data" ? answer.read() : url === "api/log" ? answer.log() : 200
      return new Response(typeof answer.data === "string" ? answer.data : JSON.stringify(answer.data), { status })
    },
    events,
    focused: () => true,
    visible: () => true,
    onVisible: () => () => {},
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
  const tickets = () => sent.filter(x => x.url === "api/ai-edit-tickets").map(({ url: _, ...ticket }) => ticket)
  // 常駐のログに送った行（窓の id と文）
  const logged = () =>
    sent.filter(x => x.url === "api/log").flatMap(x => (x.lines as { text: string }[]).map(l => [x.client, l.text]))
  return {
    host,
    sent,
    answer,
    performs,
    tickets,
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
  const store = newStore({ books: [], savedBooks: saved.books, observe: bulk => server.host.observe(bulk) })
  const stop = server.host.connect(store)
  return { ...server, store, stop }
}
// つなぎ直し（2 度目の hello）で送り直したアクション（確かめられていないアクションが無ければ空）
async function resentOnReconnect(s: Awaited<ReturnType<typeof connected>>, client: string) {
  const before = s.performs().length
  s.fail()
  s.emit("hello", { client })
  await flush()
  return s.performs().slice(before)
}
const itemsOf = (store: ReturnType<typeof newStore>) =>
  pagesOf(store.state.getState().books.b1 as Book)[0]!.items?.map(i => i.id) ?? []
const place = (store: ReturnType<typeof newStore>) =>
  store.actions.perform(
    "@matomezu/paper:item-place",
    { item: "@matomezu/box:shape-nest-box", at: { x: 0, y: 0 }, crowd: "push" },
    { page: "p1" },
  )
// アイテムを足した図面のページ p1
const p1With = (...ids: string[]) =>
  drawingPage("p1", { items: ids.map(id => ({ id, item: "@matomezu/box:shape-nest-box", x: 0, y: 0, props: {} })) })
// 常駐が知らせる、アイテムを足した b1
const b1With = (...ids: string[]): Book => ({ ...SAMPLE_BOOKS[0]!, lineup: [p1With(...ids)] })

test("知らせにつながらなければ NoServer", async () => {
  const s = fakeServer()
  const loading = s.host.load()
  s.fail()
  await expect(loading).rejects.toBeInstanceOf(NoServer)
})

test("画面 cookie を持たないブラウザは、読めずに、画面 cookie が要ると分かる E402 になる（ほかの断りは NoServer）", async () => {
  const s = fakeServer()
  s.answer.read = () => 403
  s.answer.data = "cookie-required"
  const loading = s.host.load()
  s.fail()
  await expect(loading).rejects.toMatchObject({ code: "E402" })
  s.answer.data = "forbidden"
  const again = s.host.load()
  s.fail()
  await expect(again).rejects.toBeInstanceOf(NoServer)
})

test("読むと、置いてあるブックと設定を返す", async () => {
  const s = fakeServer({ ...dataOf([SAMPLE_BOOKS[0]!]), settings: { lang: "en" } })
  const loading = s.host.load()
  s.emit("hello", { client: "c1" })
  expect(await loading).toEqual({
    books: [SAMPLE_BOOKS[0]],
    settings: { lang: "en" },
    plugins: [],
    failed: [],
    disabled: [],
  })
})

test("常駐が足した追加プラグインは、見た目の JS を読んで default で出したものを返し、CSS を読む。読み込めない物と、default で同じ id のプラグインを出さない物は外して理由を返す", async () => {
  const styles: string[] = []
  const imported: string[] = []
  const listeners = new Map<string, (data: string) => void>()
  const host = serverClient({
    fetch: async () =>
      new Response(
        JSON.stringify({
          pages: [],
          folders: [],
          settings: null,
          plugins: [
            { id: "a", ui: "api/plugins/0/ui.js", css: "api/plugins/0/ui.css" },
            { id: "b", ui: "api/plugins/1/ui.js" },
            { id: "c", ui: "api/plugins/2/ui.js", css: "api/plugins/2/ui.css" },
            { id: "d", ui: "api/plugins/3/ui.js", css: "api/plugins/3/ui.css" },
          ],
        }),
      ),
    events: () => ({ on: (name, l) => listeners.set(name, l), onError: () => {}, close: () => {} }),
    focused: () => false,
    onFocus: () => () => {},
    visible: () => true,
    onVisible: () => () => {},
    importModule: async url => {
      imported.push(url)
      if (url === "api/plugins/2/ui.js") throw new Error("broken")
      // b は default を出さず、d は manifest と違う id を出す
      if (url === "api/plugins/1/ui.js") return {}
      if (url === "api/plugins/3/ui.js") return { default: { id: "other" } }
      return { default: { id: "a" } }
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
  // 読み込めない c と、default で同じ id のプラグインを出さない b・d は外して理由を返し、ほかは読む（外した物の CSS は足さない）
  expect(loaded.plugins).toEqual([{ id: "a" }])
  expect(loaded.failed).toMatchObject([
    { id: "b", error: { code: "E316" } },
    { id: "c", error: { message: "broken" } },
    { id: "d", error: { code: "E316" } },
  ])
  expect(imported).toEqual(["api/plugins/0/ui.js", "api/plugins/1/ui.js", "api/plugins/2/ui.js", "api/plugins/3/ui.js"])
  expect(styles).toEqual(["api/plugins/0/ui.css"])
})

test("追加プラグインが変わったと届いたら、画面を読み直す", async () => {
  const { emit, reloads } = await connected()
  expect(reloads()).toBe(0)
  emit("plugins", { version: 1 })
  expect(reloads()).toBe(1)
})

test("同じ流れで行ったアクションは、振った id と並べて、1 つのアクションバルクとして、つながりの id と順の番号を添えて常駐に送る", async () => {
  const { store, sent } = await connected()
  sent.length = 0
  place(store)
  place(store)
  await flush()
  place(store)
  await flush()
  const item = { action: "@matomezu/paper:item-place", on: { page: "p1" }, lang: "ja" }
  expect(sent.filter(x => x.url === "api/perform")).toEqual([
    expect.objectContaining({
      actions: [expect.objectContaining({ ...item, ids: ["n1"] }), expect.objectContaining({ ...item, ids: ["n2"] })],
      client: "c1",
      seq: 1,
      key: "k1",
    }),
    expect.objectContaining({ actions: [expect.objectContaining({ ids: ["n3"] })], seq: 2, key: "k2" }),
  ])
})

test("ほかから変わったブックの上で、まだ確かめられていない自分のアクションを行い直す。自分の番号が返ると確かめ終わり", async () => {
  const { store, emit } = await connected()
  place(store)
  await Promise.resolve()
  expect(itemsOf(store)).toEqual(["n1"])
  emit("changed", pageChangedOf(b1With("o1"), "p1", 2, { client: "c2", seq: 5 }))
  expect(itemsOf(store)).toEqual(["o1", "n1"])
  emit("changed", pageChangedOf(b1With("o1", "n1"), "p1", 3, { client: "c1", seq: 1 }))
  expect(itemsOf(store)).toEqual(["o1", "n1"])
  // 確かめ終わったアクションは、ほかから変わったブックの上でも行い直さない
  emit("changed", pageChangedOf(b1With("o1"), "p1", 4, { client: "c2", seq: 6 }))
  expect(itemsOf(store)).toEqual(["o1"])
})

test("ゴミ箱に入ったブックはゴミ箱へ分け、消したと届いたブックは一覧から外れる（ほかのブックは同じ値のまま）", async () => {
  const { store, emit } = await connected(fakeServer({ ...dataOf(SAMPLE_BOOKS.slice(0, 3)), settings: null }))
  const bin = {
    folderRole: "trash",
    id: TRASH_ID,
    lineup: [{ kind: "book", id: "b1", trashed: "2026-10-29T00:00:00.000Z", from: [HOME_ID] }],
  }
  emit("changed", { pages: [], folders: [{ id: TRASH_ID, folder: bin, version: 1 }], books: ["b1"] })
  expect("b1" in store.state.getState().books).toBe(false)
  expect(store.state.getState().trash.b1?.id).toBe("b1")
  emit("changed", removedOf(b1With()))
  expect("b1" in store.state.getState().trash).toBe(false)
  // ゴミ箱に入っていないブックも、ページとフォルダが消えたと届けば外れる
  const before = store.state.getState().books
  emit("changed", removedOf(SAMPLE_BOOKS[1]!))
  const after = store.state.getState().books
  expect(Object.keys(after)).toEqual(["b3"])
  expect(after.b3).toBe(before.b3 as Book)
  expect(store.state.getState().trash).toEqual({})
})

test("ページ 1 枚だけが変わった知らせでは、そのページだけが入れ替わり、同じブックのほかのページとほかのブックは同じ値のまま", async () => {
  const p2 = drawingPage("p2", { title: "ページ 2" })
  const two = testBook("b1", "2 ページ", [p1With(), p2])
  const { store, emit } = await connected(fakeServer({ ...dataOf([two, SAMPLE_BOOKS[1]!]), settings: null }))
  const before = store.state.getState().books
  emit("changed", pageChangedOf(testBook("b1", "2 ページ", [p1With("x"), p2]), "p1", 2))
  const after = store.state.getState().books
  expect(itemsOf(store)).toEqual(["x"])
  expect(pagesOf(after.b1 as Book)[0]).not.toBe(pagesOf(before.b1 as Book)[0]!)
  expect(pagesOf(after.b1 as Book)[1]).toBe(pagesOf(before.b1 as Book)[1]!)
  expect(after.b2).toBe(before.b2 as Book)
})

test("形の合わない知らせは捨て、あとの知らせは受け続ける", async () => {
  const { store, emit } = await connected()
  emit("changed", { pages: [{ version: 2 }], folders: [], books: ["b1"] })
  emit("changed", pageChangedOf(b1With("x"), "p1", 3))
  expect(itemsOf(store)).toEqual(["x"])
})

test("古い版の知らせは使わない（版はページごと。ブックのフォルダの版は進まない）", async () => {
  const { store, emit } = await connected()
  emit("changed", pageChangedOf(b1With("x"), "p1", 3))
  emit("changed", pageChangedOf(b1With("old"), "p1", 2))
  expect(itemsOf(store)).toEqual(["x"])
})

test("断られた（ack で確かめ終わり、変わったブックが来ない）アクションは画面から消える", async () => {
  const { store, emit } = await connected()
  place(store)
  emit("ack", { seq: 1, ok: false, reason: "refused" })
  expect(itemsOf(store)).toEqual([])
})

test("断られたアクションを入れた画面の履歴の段は捨て、performConfirmed は常駐の断りの理由を返す", async () => {
  const { store, emit } = await connected()
  const answer = store.actions.performConfirmed(
    "@matomezu/paper:item-place",
    { item: "@matomezu/box:shape-nest-box", at: { x: 0, y: 0 }, crowd: "push" },
    { page: "p1" },
  )
  await Promise.resolve()
  expect(store.state.getState().history.b1?.undo).toHaveLength(1)
  emit("ack", { seq: 1, ok: false, reason: "being-edited" })
  expect(await answer).toEqual({ ok: false, reason: "being-edited", by: "host" })
  expect(itemsOf(store)).toEqual([])
  expect(store.state.getState().history.b1?.undo).toEqual([])
})

test("行えたアクションの画面の履歴の段は残し、performConfirmed は行った結果を返す", async () => {
  const { store, emit } = await connected()
  const answer = store.actions.performConfirmed(
    "@matomezu/paper:item-place",
    { item: "@matomezu/box:shape-nest-box", at: { x: 0, y: 0 }, crowd: "push" },
    { page: "p1" },
  )
  await Promise.resolve()
  const id = itemsOf(store)[0] as string
  emit("changed", pageChangedOf(b1With(id), "p1", 2, { client: "c1", seq: 1 }))
  emit("ack", { seq: 1, ok: true, reason: "" })
  expect(await answer).toMatchObject({ ok: true })
  expect(store.state.getState().history.b1?.undo).toHaveLength(1)
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
  s.emit("ack", { seq: 1, ok: true, reason: "" })
  expect(await resentOnReconnect(s, "c10")).toEqual([])
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
  s.answer.data = { ...dataOf([b1With("later")], { p1: 5 }), settings: null }
  s.tick()
  await flush()
  expect(s.reads()).toBe(3)
  expect(itemsOf(s.store)).toEqual(["later"])
  expect(s.logged().map(l => l[1])).toEqual([
    "lost the connection to the server",
    "reconnected as c2 (was c1): sending 0 actions again",
    "could not read the server again: NoServer",
    "took page p1 v5; the window had v1",
  ])
})

test("つなぎ直して読み直すと、常駐に無くなったブックは消える。読んでいる間に届いたブックは残す", async () => {
  const s = await connected()
  s.answer.data = { pages: [], folders: [], settings: null }
  s.fail()
  s.emit("hello", { client: "c2" })
  await flush()
  expect("b1" in s.store.state.getState().books).toBe(false)
  expect(s.logged().map(l => l[1])).toContain("removed page p1; the server does not have it")
  expect(s.logged().map(l => l[1])).toContain("removed folder b1; the server does not have it")
  s.emit("changed", changedOf(b1With("x"), 7))
  s.fail()
  s.emit("hello", { client: "c3" })
  s.emit("changed", changedOf(b1With("y"), 8))
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
  s.tick()
  await flush()
  expect(s.performs()).toHaveLength(3)
  s.answer.perform = () => 200
  expect(await resentOnReconnect(s, "c9")).toEqual([])
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

// ページもフォルダも変えない changed（設定・アノテーション・レコードだけを載せる）
const quiet = (more: object) => ({
  pages: [],
  folders: [],
  books: [],
  actions: [],
  annotations: {},
  records: [],
  window: "",
  ...more,
})

test("changed に載った設定で設定を入れ替える", async () => {
  const { store, emit } = await connected()
  emit("changed", quiet({ settings: { lang: "en", skin: "@matomezu/base:dark" } }))
  expect(store.state.getState().settings).toMatchObject({ lang: "en", skin: "@matomezu/base:dark" })
})

test("アノテーションの知らせで、そのページのアノテーションを入れ替える（空の並びなら無くす）", async () => {
  const { store, emit } = await connected()
  const list = [{ id: "c1", annotation: "@matomezu/base:note", anchors: ["x"], props: {} }]
  emit("annotations", { page: "p1", annotations: list })
  expect(store.state.getState().annotations).toEqual({ p1: list })
  emit("annotations", { page: "p1", annotations: [] })
  expect(store.state.getState().annotations).toEqual({})
})

test("changed に載ったレコードと進めた番号を当て、レコードが変わったときだけ、添えた窓がこの窓かで最後にフォーカスされた窓かを入れる", async () => {
  const { store, emit } = await connected()
  const MAIL = "@matomezu/base:mail"
  const mail = (id: string, order: number) => ({
    id,
    mail: "@matomezu/base:letter",
    from: "a",
    sentAt: "t",
    props: { title: id, body: "" },
    order,
  })
  emit(
    "changed",
    quiet({
      records: [
        { subject: MAIL, id: "m1", record: mail("m1", 1), version: 1 },
        { subject: MAIL, id: "m2", record: mail("m2", 2), version: 1 },
      ],
      counters: { [MAIL]: { mail: 3 } },
      window: "c1",
    }),
  )
  expect(Object.keys(store.state.getState().records[MAIL] ?? {})).toEqual(["m1", "m2"])
  expect(store.state.getState().counters).toEqual({ [MAIL]: { mail: 3 } })
  expect(store.state.getState().lastWindow).toBe(true)
  // レコードの変わらない知らせは、最後にフォーカスされた窓を変えない
  emit("changed", quiet({ settings: {}, window: "c2" }))
  expect(store.state.getState().lastWindow).toBe(true)
  emit(
    "changed",
    quiet({
      records: [
        { subject: MAIL, id: "m3", record: mail("m3", 3), version: 1 },
        { subject: MAIL, id: "m1", record: "removed", version: 0 },
      ],
      counters: { [MAIL]: { mail: 4 } },
      window: "c2",
    }),
  )
  expect(Object.keys(store.state.getState().records[MAIL] ?? {})).toEqual(["m2", "m3"])
  expect(store.state.getState().counters).toEqual({ [MAIL]: { mail: 4 } })
  expect(store.state.getState().lastWindow).toBe(false)
})

test("読んでいる間に届いた新しい版の知らせは、読んだ古い版で消さない", async () => {
  let answer = (_: Response) => {}
  const listeners = new Map<string, (data: string) => void>()
  const host = serverClient({
    fetch: () => new Promise<Response>(r => (answer = r)),
    events: () => ({ on: (name, l) => listeners.set(name, l), onError: () => {}, close: () => {} }),
    focused: () => false,
    onFocus: () => () => {},
    visible: () => true,
    onVisible: () => () => {},
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
  // ページだけが版 3 に進み、ブックのフォルダは読んだ版のまま
  listeners.get("changed")?.(JSON.stringify(pageChangedOf(b1With("new"), "p1", 3)))
  answer(new Response(JSON.stringify({ ...dataOf([b1With("old")], { p1: 2 }), settings: null })))
  expect((await loading).books).toEqual([b1With("new")])
})

test("読んでいる間に届いたレコード・番号・設定・アノテーションの知らせは、読んだ世界の上に当て直し、消さない", async () => {
  let answer = (_: Response) => {}
  const listeners = new Map<string, (data: string) => void>()
  const host = serverClient({
    fetch: () => new Promise<Response>(r => (answer = r)),
    events: () => ({ on: (name, l) => listeners.set(name, l), onError: () => {}, close: () => {} }),
    focused: () => false,
    onFocus: () => () => {},
    visible: () => true,
    onVisible: () => () => {},
    importModule: async () => ({}),
    addStyle: () => {},
    reload: () => {},
    later: () => () => {},
    newKey: () => "k",
    now: () => 0,
  })
  const ROOM = "@matomezu/base:workroom"
  const loading = host.load()
  listeners.get("hello")?.(JSON.stringify({ client: "c1" }))
  await Bun.sleep(0)
  // 読んだ世界より後に足されたレコード（読んだ世界には無い）
  listeners.get("changed")?.(
    JSON.stringify(
      quiet({
        records: [{ subject: ROOM, id: "r1", record: { id: "r1" }, version: 1 }],
        counters: { [ROOM]: { room: 2 } },
        settings: { a: 1 },
      }),
    ),
  )
  listeners.get("annotations")?.(JSON.stringify({ page: "p1", annotations: [] }))
  answer(new Response(JSON.stringify({ ...dataOf([b1With()]), settings: null, records: {}, counters: {} })))
  const saved = await loading
  expect(saved.settings).toEqual({ a: 1 })
  const store = newStore({ books: [], savedBooks: saved.books, observe: bulk => host.observe(bulk) })
  host.connect(store)
  expect(Object.keys(store.state.getState().records[ROOM] ?? {})).toEqual(["r1"])
  expect(store.state.getState().counters).toEqual({ [ROOM]: { room: 2 } })
})

test("窓が見ているものと、窓がフォーカスされたことを、増やす番号を付けて知らせる。変わらなければ知らせない", async () => {
  const s = await connected()
  const view = (selection: string[]) => ({
    current: "book-screen",
    book: "b1",
    page: "p1",
    mode: "edit",
    selection,
    stage: "s1",
    stages: [{ id: "s1", book: "b1", page: "p1", mode: "edit" }],
    canSplit: true,
  })
  expect(s.sent).toEqual([
    { url: "api/view", client: "c1", view: view([]), editLocks: {}, recordLocks: {}, focused: true, seq: 1 },
  ])
  s.store.actions.select("s1", ["x"])
  s.store.actions.resizeStage("s1", { w: 100, h: 100 })
  s.focus()
  expect(s.sent.slice(1)).toEqual([
    { url: "api/view", client: "c1", view: view(["x"]), editLocks: {}, recordLocks: {}, focused: false, seq: 2 },
    { url: "api/view", client: "c1", view: view(["x"]), editLocks: {}, recordLocks: {}, focused: true, seq: 3 },
  ])
})

test("利用者が直している物（useEditLock）を、その物のあるページかブックごとにまとめて見ているものと一緒に知らせる。まとめた物が変わったときだけ知らせ、全部外したら空で知らせる", async () => {
  const s = await connected()
  s.store.setEditLock("a", { within: "p1", ids: ["n1"] })
  s.store.setEditLock("b", { within: "p1", ids: ["n1", "n2"] })
  expect(s.sent.at(-1)).toMatchObject({ editLocks: { p1: ["n1", "n2"] }, seq: 3 })
  s.store.setEditLock("a", { within: "p1", ids: ["n1"] })
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
    current: "book-screen",
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
  const ws = screenOf(s.store.state.getState().window)
  expect(ws.current).toBe("s2")
  expect(ws.stages.map(st => st.opened?.outermost ?? null)).toEqual(["b1", "b1"])
})

test("show の mode が print-preview なら、印刷プレビューで開く", async () => {
  const s = await connected()
  s.emit("show", { book: "b1", mode: "print-preview" })
  expect(screenOf(s.store.state.getState().window).stages[0]?.mode.kind).toBe("print-preview")
  expect(s.sent.at(-1)?.view).toMatchObject({ mode: "print-preview" })
})

test("show の split は、そのステージを分けて右にできたステージに開く", async () => {
  const s = await connected()
  s.emit("show", { book: "b1", split: true })
  const ws = screenOf(s.store.state.getState().window)
  expect(ws.stages.map(st => st.id)).toEqual(["s1", "s2"])
  expect(ws.current).toBe("s2")
  expect(ws.stages[1]?.opened?.outermost).toBe("b1")
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
    ...dataOf([SAMPLE_BOOKS[0]!]),
    settings: null,
    touched: { b1: "2026-10-27T01:00:00Z" },
  })
  const { store, emit } = await connected(server)
  expect(store.state.getState().touched).toEqual({ b1: "2026-10-27T01:00:00Z" })
  emit("touched", { book: "unsaved", at: "2026-10-27T02:00:00Z" })
  emit("touched", { book: "b1", at: "2026-10-27T00:00:00Z" })
  expect(store.state.getState().touched).toEqual({ b1: "2026-10-27T01:00:00Z", unsaved: "2026-10-27T02:00:00Z" })
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
  s.emit("changed", pageChangedOf(b1With("x"), "p1", 3))
  s.emit("changed", pageChangedOf(b1With("x"), "p1", 1))
  s.answer.log = () => 500
  s.emit("changed", pageChangedOf(b1With("old"), "p1", 2))
  await flush()
  s.answer.log = () => 200
  s.fail()
  s.emit("hello", { client: "c2" })
  await flush()
  expect(itemsOf(s.store)).toEqual(["x"])
  expect(s.logged().slice(2)).toEqual([
    ["c2", "kept page p1 v3; the notice had v2"],
    ["c2", "lost the connection to the server"],
    ["c2", "reconnected as c2 (was c1): sending 0 actions again"],
    ["c2", "kept page p1 v3; the server has v1"],
  ])
})

test("知らせが QUIET_MS 届かなければ、黙って切れたとみて閉じてつなぎ直し、読み直してアクションを送り直す", async () => {
  const s = await connected()
  s.answer.perform = () => null
  place(s.store)
  await flush()
  s.answer.perform = () => 200
  s.answer.data = { ...dataOf([b1With("ai")], { p1: 2 }), settings: null }
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
    "took page p1 v2; the window had v1",
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

test("コントロールセンターがカレントスクリーンの間は、見ているものを current と hidden に分けて知らせる", async () => {
  const s = await connected()
  showCenter(s.store)
  expect(s.sent.at(-1)?.view).toEqual({
    current: "control-center",
    hidden: {
      book: "b1",
      page: "p1",
      mode: "edit",
      selection: [],
      stage: "s1",
      stages: [{ id: "s1", book: "b1", page: "p1", mode: "edit" }],
      canSplit: true,
    },
  })
})

test("AI の変更を見た・見られず消えた知らせは、1 つずつ常駐に送る。送れない・5xx なら溜めて次に送るときに順に送り直し、4xx なら捨てる", async () => {
  const s = await connected()
  const seen = (act: string) => ({ act, places: ["p1"], outcome: "seen" }) as const
  s.host.reportAIEditTicket(seen("a1"))
  await flush()
  expect(s.tickets()).toEqual([seen("a1")])
  s.answer.tickets = () => 500
  s.host.reportAIEditTicket(seen("a2"))
  await flush()
  s.answer.tickets = () => null
  s.host.reportAIEditTicket(seen("a3"))
  await flush()
  expect(s.tickets().map(t => t.act)).toEqual(["a1", "a2", "a2"])
  s.answer.tickets = () => 400
  s.host.reportAIEditTicket(seen("a4"))
  await flush()
  s.answer.tickets = () => 200
  s.host.reportAIEditTicket(seen("a5"))
  await flush()
  expect(s.tickets().map(t => t.act)).toEqual(["a1", "a2", "a2", "a2", "a3", "a4", "a5"])
})

test("参加者の最後に呼ばれた時刻の知らせは、新しい物だけを使い、同じか古い物は捨てる", async () => {
  const s = await connected()
  const calls = () => s.store.state.getState().participantCalls
  s.emit("participant-calls", { participant: "p1", at: "2026-11-09T10:00:00Z" })
  s.emit("participant-calls", { participant: "p1", at: "2026-11-09T09:00:00Z" })
  s.emit("participant-calls", { participant: "p1", at: "2026-11-09T10:00:00Z" })
  expect(calls()).toEqual({ p1: "2026-11-09T10:00:00Z" })
  s.emit("participant-calls", { participant: "p1", at: "2026-11-09T11:00:00Z" })
  s.emit("participant-calls", { participant: "p2", at: "2026-11-09T08:00:00Z" })
  expect(calls()).toEqual({ p1: "2026-11-09T11:00:00Z", p2: "2026-11-09T08:00:00Z" })
})

test("準備中でない参加者の知らせは、同じ id を重ねて持たない", async () => {
  const s = await connected()
  const ready = () => s.store.state.getState().participantReady
  expect(ready()).toEqual([])
  s.emit("participant-ready", { participant: "p1" })
  s.emit("participant-ready", { participant: "p1" })
  s.emit("participant-ready", { participant: "p2" })
  expect(ready()).toEqual(["p1", "p2"])
})
