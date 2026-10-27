import { expect, test } from "bun:test"
import type { BookOf } from "../../web/src/core/schema/book"
import { bookTheme, bookTokens } from "../../web/src/plugins/base/book-look/look"
import { newStore } from "../support"

const book = (store: ReturnType<typeof newStore>) =>
  store.state.getState().books.b1 as BookOf<"@matomezu/drawing:drawing">
const update = (store: ReturnType<typeof newStore>, args: Record<string, unknown>) =>
  store.actions.perform("@matomezu/base:book-update", args, { book: "b1" })

const THEME = "@matomezu/base:book-theme"
const PAPER = "@matomezu/base:book-paper-color"
const look = (settings: Record<string, unknown>) => ({ settings })

test("ブックのテーマと紙の色は base の設定の項目で、@matomezu/base:book-update の settings で変える。渡さない項目はそのまま、null で消す。表に無いテーマ・色の値でないものは断る", () => {
  const store = newStore()
  expect(update(store, look({ [THEME]: "@matomezu/base:sticky", [PAPER]: "#FEFCE8" })).ok).toBe(true)
  expect(book(store).settings).toEqual({ [THEME]: "@matomezu/base:sticky", [PAPER]: "#fefce8" })
  expect(update(store, look({ [PAPER]: null })).ok).toBe(true)
  expect(book(store).settings).toEqual({ [THEME]: "@matomezu/base:sticky" })
  expect(update(store, look({ [THEME]: "nope" })).ok).toBe(false)
  expect(update(store, look({ [PAPER]: "yellow" })).ok).toBe(false)
  expect(update(store, look({ [THEME]: null })).ok).toBe(true)
  expect("settings" in book(store)).toBe(false)
  // 古い形の引数は受け付けない
  expect(update(store, { theme: "@matomezu/base:sticky" }).ok).toBe(false)
})

test("ブックのテーマは、テーマの項目（無いか表に無ければブックのタイプのテーマ）。紙の色は紙のテーマキーを上書きする。箱のテーマキーもブックのテーマで決まる", () => {
  const store = newStore()
  const catalog = store.catalog.core
  expect(bookTheme(catalog, book(store))).toBe("@matomezu/base:standard")
  expect(bookTokens(catalog, book(store))["@matomezu/box:box-fill"]).toEqual({ light: "#ffffff", dark: "#ffffff" })
  update(store, look({ [THEME]: "@matomezu/base:sticky" }))
  expect(bookTheme(catalog, book(store))).toBe("@matomezu/base:sticky")
  expect(bookTokens(catalog, book(store))["@matomezu/box:box-fill"]).toEqual({ light: "#fff3a6", dark: "#fff3a6" })
  expect(bookTokens(catalog, book(store)).paper).toEqual({ light: "#f4efe4", dark: "#f4efe4" })
  update(store, look({ [PAPER]: "#0f172a" }))
  expect(bookTokens(catalog, book(store)).paper).toEqual({ light: "#0f172a", dark: "#0f172a" })
  expect(bookTheme(catalog, { ...book(store), settings: { [THEME]: "nope" } })).toBe("@matomezu/base:standard")
})

test("ダイアログの下書きは、アイテムを指さなければブックそのものの下書き", () => {
  const store = newStore()
  store.actions.openDialog("s1", "@matomezu/base:book-settings")
  store.actions.previewDialog({ book: "b1", props: { [THEME]: "@matomezu/base:simple" } })
  expect(store.state.getState().dialog?.preview).toEqual({ book: "b1", props: { [THEME]: "@matomezu/base:simple" } })
  expect("settings" in book(store)).toBe(false)
})

test("@matomezu/base:book-update でブックの名前を変える。前後の空白は除き、空にはできない", () => {
  const store = newStore()
  expect(update(store, { title: "  新しい名前 " }).ok).toBe(true)
  expect(book(store).title).toBe("新しい名前")
  expect(update(store, { title: "   " }).ok).toBe(false)
  expect(update(store, { title: "" }).ok).toBe(false)
  expect(book(store).title).toBe("新しい名前")
})
