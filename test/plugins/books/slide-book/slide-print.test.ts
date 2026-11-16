// スライドを印刷に出すか（ページの設定 slide-print）: ページ → 既定の順に引き、見せ方の printSheets が載っている印刷区画を決める

import { expect, test } from "bun:test"
import { settingsAt } from "../../../../web/src/plugins/base/book-settings"
import { slidePrintSheets } from "../../../../web/src/plugins/books/slide-book/print"
import { CORE_CATALOG } from "../../../support"

const TEXT = "@matomezu/slide:slide-text"
const text = { id: "t", item: TEXT, x: 10, y: 10, w: 100, h: 40, props: { text: "a" } }
const PRINT = "@matomezu/slide-book:slide-print"

const sheetsOf = (slide: object[], page: object = {}) => {
  const p = {
    kind: "page" as const,
    type: "@matomezu/slide-book:slide",
    id: "p1",
    title: "P",
    paper: "@matomezu/base:ratio-16x9",
    orientation: "landscape" as const,
    slide,
    ...page,
  }
  return slidePrintSheets(CORE_CATALOG, p as never, { setting: settingsAt(CORE_CATALOG, p) })
}

test("既定の auto は、アイテムが載ったスライドだけを出す", () => {
  expect([...sheetsOf([text]).filled]).toHaveLength(1)
  expect([...sheetsOf([]).filled]).toHaveLength(0)
})

test("always は何も無くても出し、never はあっても出さない", () => {
  expect([...sheetsOf([], { settings: { [PRINT]: "always" } }).filled]).toHaveLength(1)
  expect([...sheetsOf([text], { settings: { [PRINT]: "never" } }).filled]).toHaveLength(0)
})
