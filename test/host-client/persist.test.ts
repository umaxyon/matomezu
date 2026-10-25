import { expect, test } from "bun:test"
import type { Book } from "../../web/src/core/schema/book"
import type { Settings } from "../../web/src/core/settings"
import { memoryHost } from "../../web/src/host-client/memory"
import { persist } from "../../web/src/host-client/persist"
import { newStore } from "../support"

// 頼まれた順に残す中身を覚える
function recording() {
  const books: Book[] = []
  const settings: Settings[] = []
  return {
    host: {
      saveBook: (b: Book) => books.push(b),
      saveSettings: (s: Settings) => settings.push(s),
    },
    books,
    settings,
  }
}

test("アクションで変わったブックだけを残すように頼む。画面の状態だけの変化では頼まない", () => {
  const store = newStore()
  const rec = recording()
  persist(store, rec.host)
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  store.actions.select("s1", ["x"])
  expect(rec.books).toEqual([])
  store.actions.perform("item.place", { page: "p1", item: "shape.box", at: { x: 0, y: 0 } }, { book: "b2" })
  expect(rec.books.map(b => b.id)).toEqual(["b2"])
  expect(rec.books[0]).toBe(store.state.getState().books.b2!)
})

test("設定が変われば残すように頼む。同じ値では頼まない", () => {
  const store = newStore()
  const rec = recording()
  persist(store, rec.host)
  store.actions.setLang("ja")
  expect(rec.settings).toEqual([])
  store.actions.setLang("en")
  expect(rec.settings.map(s => s.lang)).toEqual(["en"])
})

test("止めたあとは頼まない", () => {
  const store = newStore()
  const rec = recording()
  persist(store, rec.host)()
  store.actions.setLang("en")
  expect(rec.settings).toEqual([])
})

test("メモリのホストは残したものを次に読む", async () => {
  const host = memoryHost([])
  const store = newStore({ books: [], savedBooks: (await host.load()).books })
  host.connect(store)
  store.actions.createBook("s1", { title: "新しいブック", type: "drawing" })
  store.actions.setSkin("dark")
  const again = await host.load()
  expect(again.books).toContainEqual(expect.objectContaining({ title: "新しいブック" }))
  expect(again.settings).toMatchObject({ skin: "dark" })
})

test("残した設定は、この app で使える項目だけ使う（無い言語・無いスキン・形の合わない値は捨てる）", () => {
  const pick = (settings: unknown) => newStore({ settings }).state.getState().settings
  expect(pick({ lang: "en", skin: "dark" })).toMatchObject({ lang: "en", skin: "dark" })
  expect(pick({ lang: "xx", skin: "nope", keys: { added: "bad" } })).toEqual(pick(undefined))
  expect(pick("broken")).toEqual(pick(undefined))
})
