import { expect, test } from "bun:test"
import { NO_KEY_CHANGES } from "../../web/src/core/keys"
import type { Book } from "../../web/src/core/schema/book"
import { keyChangesOf, type Settings, skinOf } from "../../web/src/core/settings"
import { memoryClient } from "../../web/src/host-client/memory"
import { persist } from "../../web/src/host-client/persist"
import { createBookIn } from "../../web/src/plugins/base"
import { CORE_CATALOG, newStore } from "../support"

const LANG = "@matomezu/base:lang"
const SKIN = "@matomezu/base:skin"
const KEYS = "@matomezu/base:keys"

// 頼まれた順に残す中身を覚える
function recording() {
  const books: Book[] = []
  const settings: Settings[] = []
  return {
    host: {
      saveBook: (b: Book) => books.push(b),
      removeBook: () => {},
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
  store.actions.perform(
    "@matomezu/paper:item-place",
    { page: "p1", item: "@matomezu/box:shape-nest-box", at: { x: 0, y: 0 } },
    { book: "b2" },
  )
  expect(rec.books.map(b => b.id)).toEqual(["b2"])
  expect(rec.books[0]).toBe(store.state.getState().books.b2!)
})

test("設定が変われば残すように頼む。同じ値では頼まない", () => {
  const store = newStore()
  const rec = recording()
  persist(store, rec.host)
  store.actions.perform("@matomezu/base:settings-set", { values: { [LANG]: "matomezu:en" } }).ok
  store.actions.perform("@matomezu/base:settings-set", { values: { [LANG]: "matomezu:en" } }).ok
  expect(rec.settings.map(s => s[LANG])).toEqual(["matomezu:en"])
})

test("止めたあとは頼まない", () => {
  const store = newStore()
  const rec = recording()
  persist(store, rec.host)()
  store.actions.perform("@matomezu/base:settings-set", { values: { [LANG]: "matomezu:en" } }).ok
  expect(rec.settings).toEqual([])
})

test("メモリのホストは残したものを次に読む", async () => {
  const host = memoryClient([])
  const store = newStore({ books: [], savedBooks: (await host.load()).books })
  host.connect(store)
  createBookIn(store, "s1", { title: "新しいブック", type: "@matomezu/drawing:drawing" })
  store.actions.perform("@matomezu/base:settings-set", { values: { [SKIN]: "@matomezu/base:dark" } }).ok
  const again = await host.load()
  expect(again.books).toContainEqual(expect.objectContaining({ title: "新しいブック" }))
  expect(again.settings).toEqual({ [SKIN]: "@matomezu/base:dark" })
})

test("残した設定は捨てずに持ち、このインスタンスで使えない値（無い言語パック・無いスキン・形の合わない値）は、読むときに既定にする", () => {
  const pick = (settings: unknown) => newStore({ settings, lang: "ja" }).state.getState()
  const good = pick({ [LANG]: "matomezu:en", [SKIN]: "@matomezu/base:dark" })
  expect(good.lang).toBe("en")
  expect(skinOf(CORE_CATALOG, good.settings)).toBe("@matomezu/base:dark")
  const bad = { [LANG]: "matomezu:xx", [SKIN]: "nope", [KEYS]: { added: "bad" }, "@gone/x:y": 1 }
  const kept = pick(bad)
  expect(kept.settings).toEqual(bad)
  expect(kept.lang).toBe("ja")
  expect(skinOf(CORE_CATALOG, kept.settings)).toBe("auto")
  expect(keyChangesOf(CORE_CATALOG, kept.settings)).toEqual(NO_KEY_CHANGES)
  expect(pick("broken").settings).toEqual({})
})
