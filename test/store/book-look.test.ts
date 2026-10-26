import { expect, test } from "bun:test"
import type { BookOf } from "../../web/src/core/schema/book"
import { bookTheme, bookTokens } from "../../web/src/core/theme"
import { newStore } from "../support"

const book = (store: ReturnType<typeof newStore>) =>
  store.state.getState().books.b1 as BookOf<"@matomezu/drawing:drawing">
const update = (store: ReturnType<typeof newStore>, args: Record<string, unknown>) =>
  store.actions.perform("@matomezu/base:book-update", args, { book: "b1" })

test("@matomezu/base:book-update でブックのテーマと紙の色を変える。渡さない項目はそのまま、null で消す。表に無いテーマ・色の値でないものは断る", () => {
  const store = newStore()
  expect(update(store, { theme: "@matomezu/base:sticky", paperColor: "#FEFCE8" }).ok).toBe(true)
  expect(book(store)).toMatchObject({ theme: "@matomezu/base:sticky", paperColor: "#fefce8" })
  expect(update(store, { paperColor: null }).ok).toBe(true)
  expect(book(store)).toMatchObject({ theme: "@matomezu/base:sticky" })
  expect("paperColor" in book(store)).toBe(false)
  expect(update(store, { theme: "nope" }).ok).toBe(false)
  expect(update(store, { paperColor: "yellow" }).ok).toBe(false)
  expect(update(store, { theme: null }).ok).toBe(true)
  expect("theme" in book(store)).toBe(false)
})

test("ブックのテーマは、ブックの theme（無いか表に無ければブックのタイプのテーマ）。紙の色は紙の欄を上書きする。箱の欄もブックのテーマで決まる", () => {
  const store = newStore()
  const catalog = store.catalog.core
  expect(bookTheme(catalog, book(store))).toBe("@matomezu/base:standard")
  expect(bookTokens(catalog, book(store))["@matomezu/box:box-fill"]).toEqual({ light: "#ffffff", dark: "#ffffff" })
  update(store, { theme: "@matomezu/base:sticky" })
  expect(bookTheme(catalog, book(store))).toBe("@matomezu/base:sticky")
  expect(bookTokens(catalog, book(store))["@matomezu/box:box-fill"]).toEqual({ light: "#fff3a6", dark: "#fff3a6" })
  expect(bookTokens(catalog, book(store)).paper).toEqual({ light: "#f4efe4", dark: "#f4efe4" })
  update(store, { paperColor: "#0f172a" })
  expect(bookTokens(catalog, book(store)).paper).toEqual({ light: "#0f172a", dark: "#0f172a" })
  expect(bookTheme(catalog, { ...book(store), theme: "nope" })).toBe("@matomezu/base:standard")
})

test("ダイアログの下書きは、アイテムを指さなければブックそのものの下書き", () => {
  const store = newStore()
  store.actions.openDialog("s1", "@matomezu/base:book-settings")
  store.actions.previewDialog({ book: "b1", props: { theme: "@matomezu/base:simple" } })
  expect(store.state.getState().dialog?.preview).toEqual({ book: "b1", props: { theme: "@matomezu/base:simple" } })
  expect("theme" in book(store)).toBe(false)
})

test("@matomezu/base:book-update でブックの名前を変える。前後の空白は除き、空にはできない", () => {
  const store = newStore()
  expect(update(store, { title: "  新しい名前 " }).ok).toBe(true)
  expect(book(store).title).toBe("新しい名前")
  expect(update(store, { title: "   " }).ok).toBe(false)
  expect(update(store, { title: "" }).ok).toBe(false)
  expect(book(store).title).toBe("新しい名前")
})
