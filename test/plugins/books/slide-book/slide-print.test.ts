// スライドを印刷に出すか（設定 slide-print）: ページ → ブック → 既定の順に引き、見せ方の printSheets が載っている印刷区画を決める
import { expect, test } from "bun:test"
import { settingsAt } from "../../../../web/src/plugins/base/book-settings"
import { slidePrintSheets } from "../../../../web/src/plugins/books/slide-book/print"
import { CORE_CATALOG } from "../../../support"

const TEXT = "@matomezu/slide:slide-text"
const text = { id: "t", item: TEXT, x: 10, y: 10, w: 100, h: 40, props: { text: "a" } }
const PRINT = "@matomezu/slide-book:slide-print"

const sheetsOf = (slide: object[], book: object, page: object) => {
  const p = {
    id: "p1",
    title: "P",
    paper: "@matomezu/base:ratio-16x9",
    orientation: "landscape" as const,
    slide,
    ...page,
  }
  const b = { type: "@matomezu/slide-book:slide", id: "s1", title: "S", pages: [p], ...book }
  return slidePrintSheets(CORE_CATALOG, p as never, { setting: settingsAt(CORE_CATALOG, b as never, p as never) })
}

test("既定の auto は、アイテムが載ったスライドだけを出す", () => {
  expect([...sheetsOf([text], {}, {}).filled]).toHaveLength(1)
  expect([...sheetsOf([], {}, {}).filled]).toHaveLength(0)
})

test("always は何も無くても出し、never はあっても出さない", () => {
  expect([...sheetsOf([], { settings: { [PRINT]: "always" } }, {}).filled]).toHaveLength(1)
  expect([...sheetsOf([text], { settings: { [PRINT]: "never" } }, {}).filled]).toHaveLength(0)
})

test("ページの設定がブックの設定に勝つ", () => {
  expect([
    ...sheetsOf([text], { settings: { [PRINT]: "never" } }, { settings: { [PRINT]: "always" } }).filled,
  ]).toHaveLength(1)
  expect([
    ...sheetsOf([text], { settings: { [PRINT]: "always" } }, { settings: { [PRINT]: "never" } }).filled,
  ]).toHaveLength(0)
})
