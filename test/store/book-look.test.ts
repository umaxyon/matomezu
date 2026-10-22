import { expect, test } from "bun:test"
import type { BookOf } from "../../web/src/core/schema/book"
import { bookTheme, bookTokens } from "../../web/src/core/theme"
import { newStore } from "../support"

const book = (store: ReturnType<typeof newStore>) => store.state.getState().books.b1 as BookOf<"drawing">
const update = (store: ReturnType<typeof newStore>, args: Record<string, unknown>) =>
  store.actions.perform("book.update", args, { book: "b1" })

test("book.update でブックのテーマと紙の色を変える。渡さない項目はそのまま、null で消す。表に無いテーマ・色の値でないものは断る", () => {
  const store = newStore()
  expect(update(store, { theme: "sticky", paperColor: "#FEFCE8" }).ok).toBe(true)
  expect(book(store)).toMatchObject({ theme: "sticky", paperColor: "#fefce8" })
  expect(update(store, { paperColor: null }).ok).toBe(true)
  expect(book(store)).toMatchObject({ theme: "sticky" })
  expect("paperColor" in book(store)).toBe(false)
  expect(update(store, { theme: "nope" }).ok).toBe(false)
  expect(update(store, { paperColor: "yellow" }).ok).toBe(false)
  expect(update(store, { theme: null }).ok).toBe(true)
  expect("theme" in book(store)).toBe(false)
})

test("ブックのテーマは、ブックの theme（無いか表に無ければブックのタイプのテーマ）。紙の色は紙の欄を上書きする。箱の欄もブックのテーマで決まる", () => {
  const store = newStore()
  const reg = store.registry
  expect(bookTheme(reg, book(store))).toBe("standard")
  expect(bookTokens(reg, book(store))["box.fill"]).toEqual({ light: "#ffffff", dark: "#ffffff" })
  update(store, { theme: "sticky" })
  expect(bookTheme(reg, book(store))).toBe("sticky")
  expect(bookTokens(reg, book(store))["box.fill"]).toEqual({ light: "#fff3a6", dark: "#fff3a6" })
  expect(bookTokens(reg, book(store)).paper).toEqual({ light: "#f4efe4", dark: "#f4efe4" })
  update(store, { paperColor: "#0f172a" })
  expect(bookTokens(reg, book(store)).paper).toEqual({ light: "#0f172a", dark: "#0f172a" })
  expect(bookTheme(reg, { ...book(store), theme: "nope" })).toBe("standard")
})

test("ダイアログの下書きは、アイテムを指さなければブックそのものの下書き", () => {
  const store = newStore()
  store.actions.openDialog("s1", "drawing.settings")
  store.actions.previewDialog({ book: "b1", props: { theme: "simple" } })
  expect(store.state.getState().dialog?.preview).toEqual({ book: "b1", props: { theme: "simple" } })
  expect("theme" in book(store)).toBe(false)
})

test("book.update でブックの名前を変える。前後の空白は除き、空にはできない", () => {
  const store = newStore()
  expect(update(store, { title: "  新しい名前 " }).ok).toBe(true)
  expect(book(store).title).toBe("新しい名前")
  expect(update(store, { title: "   " }).ok).toBe(false)
  expect(update(store, { title: "" }).ok).toBe(false)
  expect(book(store).title).toBe("新しい名前")
})
