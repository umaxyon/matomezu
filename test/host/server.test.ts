import { expect, test } from "bun:test"
import type { Book } from "../../web/src/core/schema/book"
import { NoServer, serverHost } from "../../web/src/host/server"
import { SAMPLE_BOOKS } from "../../web/src/sample-books"

interface Sent {
  url: string
  body: unknown
}

// 常駐の代わり: 送られた書き込みを覚え、answer の答えを返す
function fakeServer(answer: (url: string, body: unknown) => Response) {
  const sent: Sent[] = []
  const fetcher = async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    if (init?.method === "PUT") sent.push({ url, body })
    return answer(url, body)
  }
  return { sent, host: serverHost(fetcher) }
}
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status })
const b1 = SAMPLE_BOOKS[0]!
const data = { books: [{ id: "b1", book: b1, version: 3 }], settings: { lang: "en" } }

test("読むと、置いてあるブックと設定を返す。設定が無ければ undefined", async () => {
  expect(await fakeServer(() => json(data)).host.load()).toEqual({ books: [b1], settings: { lang: "en" } })
  const empty = fakeServer(() => json({ books: [], settings: null }))
  expect(await empty.host.load()).toEqual({ books: [], settings: undefined })
})

test("常駐が答えなければ（無い道・つながらない）NoServer。常駐の誤りは誤りの番号で投げる", async () => {
  await expect(fakeServer(() => new Response("", { status: 404 })).host.load()).rejects.toBeInstanceOf(NoServer)
  const down = serverHost(() => Promise.reject(new TypeError("down")))
  await expect(down.load()).rejects.toBeInstanceOf(NoServer)
  await expect(fakeServer(() => new Response("", { status: 500 })).host.load()).rejects.toMatchObject({ code: "E401" })
})

test("続けて変わったブックは 1 回にまとめ、読んだ版を添えて書く。書いたあとは返った版を添える", async () => {
  let version = 3
  const s = fakeServer(url => (url === "api/data" ? json(data) : json({ version: ++version })))
  await s.host.load()
  s.host.saveBook({ ...b1, title: "1" })
  s.host.saveBook({ ...b1, title: "2" })
  await s.host.flush()
  expect(s.sent).toEqual([{ url: "api/books/b1", body: { book: { ...b1, title: "2" }, base: 3 } }])
  s.host.saveBook({ ...b1, title: "3" })
  await s.host.flush()
  expect(s.sent[1]!.body).toMatchObject({ base: 4 })
})

test("まだ置いていないブックは版 0 で書く", async () => {
  const s = fakeServer(url => (url === "api/data" ? json({ books: [], settings: null }) : json({ version: 1 })))
  await s.host.load()
  const book: Book = { ...b1, id: "new" }
  s.host.saveBook(book)
  await s.host.flush()
  expect(s.sent).toEqual([{ url: "api/books/new", body: { book, base: 0 } }])
})

test("ほかから書き換えられていた（409）ブックは、それから書かない。ほかのブックは書く", async () => {
  const s = fakeServer(url =>
    url === "api/data" ? json(data) : url === "api/books/b1" ? json(null, 409) : json({ version: 1 }),
  )
  await s.host.load()
  s.host.saveBook({ ...b1, title: "x" })
  await s.host.flush()
  expect([...s.host.stale]).toEqual(["b1"])
  s.host.saveBook({ ...b1, title: "y" })
  s.host.saveBook({ ...b1, id: "b2" })
  await s.host.flush()
  expect(s.sent.map(x => x.url)).toEqual(["api/books/b1", "api/books/b2"])
})

test("設定は最後の値を書く", async () => {
  const s = fakeServer(() => json({}))
  s.host.saveSettings({ lang: "en", skin: "auto", keys: { added: [], removed: [] } })
  s.host.saveSettings({ lang: "ja", skin: "dark", keys: { added: [], removed: [] } })
  await s.host.flush()
  expect(s.sent).toEqual([
    { url: "api/settings", body: { lang: "ja", skin: "dark", keys: { added: [], removed: [] } } },
  ])
})
