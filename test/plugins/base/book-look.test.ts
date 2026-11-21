import { expect, test } from "bun:test"
import { pagesOf } from "../../../web/src/core/book"
import type { Book } from "../../../web/src/core/schema/book"
import { pageTheme, pageTokens } from "../../../web/src/plugins/base/book-look/look"
import { ownSettings } from "../../../web/src/plugins/base/book-settings"
import { newStore } from "../../support"

const book = (store: ReturnType<typeof newStore>) => store.state.getState().books.b1 as Book
const page = (store: ReturnType<typeof newStore>) => pagesOf(book(store))[0]!
const update = (store: ReturnType<typeof newStore>, args: Record<string, unknown>) =>
  store.actions.perform("@matomezu/base:book-update", args, { book: "b1" })
const updatePage = (store: ReturnType<typeof newStore>, settings: Record<string, unknown>) =>
  store.actions.perform("@matomezu/base:page-update", { settings }, { page: "p1" })

const THEME = "@matomezu/base:page-theme"
const PAPER = "@matomezu/base:page-paper-color"

test("ページのテーマと紙の色は base のページの設定の項目で、@matomezu/base:page-update の settings で変える。渡さない項目はそのまま、null で消す。表に無いテーマ・タイプが使えないテーマ・色の値でないものは断る", () => {
  const store = newStore()
  expect(updatePage(store, { [THEME]: "@matomezu/base:sticky", [PAPER]: "#FEFCE8" }).ok).toBe(true)
  expect(ownSettings(page(store))).toEqual({ [THEME]: "@matomezu/base:sticky", [PAPER]: "#fefce8" })
  expect(updatePage(store, { [PAPER]: null }).ok).toBe(true)
  expect(ownSettings(page(store))).toEqual({ [THEME]: "@matomezu/base:sticky" })
  expect(updatePage(store, { [THEME]: "nope" }).ok).toBe(false)
  expect(updatePage(store, { [THEME]: "@matomezu/markdown:github-like" }).ok).toBe(false) // 図のページは文書のテーマを選べない
  expect(updatePage(store, { [PAPER]: "yellow" }).ok).toBe(false)
  expect(updatePage(store, { [THEME]: null }).ok).toBe(true)
  expect("settings" in page(store)).toBe(false)
  // ブックはページの見た目の項目を持たない
  expect(update(store, { settings: { [THEME]: "@matomezu/base:sticky" } }).ok).toBe(false)
})

test("ページのテーマは、テーマの項目（無いか、表に無いか、タイプが選べなければページのタイプの既定のテーマ）。紙の色は紙のテーマキーを上書きする。箱のテーマキーもページのテーマで決まる", () => {
  const store = newStore()
  const catalog = store.catalog.core
  expect(pageTheme(catalog, page(store))).toBe("@matomezu/base:standard")
  expect(pageTokens(catalog, page(store))["@matomezu/box:box-fill"]).toEqual({ light: "#ffffff", dark: "#ffffff" })
  updatePage(store, { [THEME]: "@matomezu/base:sticky" })
  expect(pageTheme(catalog, page(store))).toBe("@matomezu/base:sticky")
  expect(pageTokens(catalog, page(store))["@matomezu/box:box-fill"]).toEqual({ light: "#fff3a6", dark: "#fff3a6" })
  expect(pageTokens(catalog, page(store)).paper).toEqual({ light: "#f4efe4", dark: "#f4efe4" })
  updatePage(store, { [PAPER]: "#0f172a" })
  expect(pageTokens(catalog, page(store)).paper).toEqual({ light: "#0f172a", dark: "#0f172a" })
  const nope = { ...page(store), settings: { [THEME]: "nope" } }
  expect(pageTheme(catalog, nope)).toBe("@matomezu/base:standard")
  // データに残った、タイプが使えないテーマも使わない（データは消さない）
  const doc = { ...page(store), settings: { [THEME]: "@matomezu/markdown:github-like" } }
  expect(pageTheme(catalog, doc)).toBe("@matomezu/base:standard")
})

test("ダイアログの下書きは、アイテムを指さなければブックそのものの下書き", () => {
  const store = newStore()
  store.actions.openDialog("s1", "@matomezu/base:book-settings")
  store.actions.previewDialog({ outermost: "b1", props: { [THEME]: "@matomezu/base:simple" } })
  expect(store.state.getState().dialog?.preview).toEqual({
    outermost: "b1",
    props: { [THEME]: "@matomezu/base:simple" },
  })
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
