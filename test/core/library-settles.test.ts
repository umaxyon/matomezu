import { expect, test } from "bun:test"
import { librarySettles } from "../../web/src/core/perform"
import { SAMPLE_BOOKS } from "../sample-books"
import { CORE_CATALOG } from "../support"

const book = SAMPLE_BOOKS[0]!
const before = { [book.id]: book }

test("一覧が対象のアクションの結果は、変わったブックが形に合い、置いた鍵がブックの id と同じときだけ通る", () => {
  expect(librarySettles(CORE_CATALOG, before, before)).toBe(true)
  expect(librarySettles(CORE_CATALOG, before, { [book.id]: { ...book, title: "変えた" } })).toBe(true)
  // 形に合わない（土台のフィールドが違う・タイプの形に無いフィールド）
  expect(librarySettles(CORE_CATALOG, before, { [book.id]: { ...book, color: "red" } as never })).toBe(false)
  expect(librarySettles(CORE_CATALOG, before, { [book.id]: { ...book, project: "" } })).toBe(false)
  // 鍵と id が違う
  expect(librarySettles(CORE_CATALOG, before, { ...before, other: book })).toBe(false)
  // 増やしたブックも確かめる
  expect(librarySettles(CORE_CATALOG, before, { ...before, other: { ...book, id: "other" } })).toBe(true)
  expect(
    librarySettles(CORE_CATALOG, before, { ...before, other: { ...book, id: "other", color: "x" } as never }),
  ).toBe(false)
})
