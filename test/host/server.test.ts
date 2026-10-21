import { expect, test } from "bun:test"
import type { BookOf } from "../../web/src/core/schema/book"
import { type Events, NoServer, serverHost } from "../../web/src/host/server"
import { SAMPLE_BOOKS } from "../../web/src/sample-books"
import { newStore } from "../support"

// 常駐の代わり: 送られたアクションを覚え、知らせ（emit）を手で送る
function fakeServer(data: unknown = { books: [{ id: "b1", book: SAMPLE_BOOKS[0], version: 1 }], settings: null }) {
  const sent: Record<string, unknown>[] = []
  const listeners = new Map<string, (data: string) => void>()
  let onError = () => {}
  let reads = 0
  const events: Events = {
    on: (name, l) => listeners.set(name, l),
    onError: l => {
      onError = l
    },
    close: () => {},
  }
  const host = serverHost({
    fetch: async (url, init) => {
      if (url === "api/perform") sent.push(JSON.parse(String(init?.body)))
      if (url === "api/data") reads++
      return new Response(JSON.stringify(data))
    },
    events: () => events,
  })
  const emit = (name: string, v: unknown) => listeners.get(name)?.(JSON.stringify(v))
  return { host, sent, emit, fail: () => onError(), reads: () => reads }
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
  (store.state.getState().books.b1 as BookOf<"drawing">).pages[0]!.items?.map(i => i.id) ?? []
const place = (store: ReturnType<typeof newStore>) =>
  store.actions.perform("item.place", { page: "p1", item: "shape.box", at: { x: 0, y: 0 } }, { book: "b1" })
// 常駐が知らせる、アイテムを足した b1
const b1With = (...ids: string[]) => ({
  ...SAMPLE_BOOKS[0],
  pages: [{ ...SAMPLE_BOOKS[0]!.pages[0], items: ids.map(id => ({ id, item: "shape.box", x: 0, y: 0, props: {} })) }],
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
  expect(await loading).toEqual({ books: [SAMPLE_BOOKS[0]], settings: { lang: "en" } })
})

test("画面で行ったアクションは、振った id と、つながりの id と順の番号を添えて常駐に送る", async () => {
  const { store, sent } = await connected()
  place(store)
  place(store)
  expect(sent).toEqual([
    expect.objectContaining({
      action: "item.place",
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
  emit("settings", { settings: { lang: "en", skin: "dark" } })
  expect(store.state.getState().settings).toMatchObject({ lang: "en", skin: "dark" })
})

test("読んでいる間に届いた新しい版の知らせは、読んだ古い版で消さない", async () => {
  let answer = (_: Response) => {}
  const listeners = new Map<string, (data: string) => void>()
  const host = serverHost({
    fetch: () => new Promise<Response>(r => (answer = r)),
    events: () => ({ on: (name, l) => listeners.set(name, l), onError: () => {}, close: () => {} }),
  })
  const loading = host.load()
  listeners.get("hello")?.(JSON.stringify({ client: "c1" }))
  await Bun.sleep(0)
  listeners.get("book")?.(JSON.stringify({ book: b1With("new"), version: 3 }))
  answer(new Response(JSON.stringify({ books: [{ id: "b1", book: b1With("old"), version: 2 }], settings: null })))
  expect((await loading).books).toEqual([b1With("new")])
})
