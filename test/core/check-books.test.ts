import { expect, test } from "bun:test"
import { checkBooks } from "../../web/src/core/book"
import { noticeText } from "../../web/src/core/notices"
import { SAMPLE_BOOKS } from "../../web/src/sample-books"
import { CORE_CATALOG } from "../support"

test("読めるブックと、読めないブックの注意（タイプが無い N004・形に合わない N005・決まりを守らない N006）に分ける", () => {
  const ok = SAMPLE_BOOKS[0]!
  const noType = { type: "@foo/stamps:board", id: "x1", title: "スタンプ帳" }
  const misfit = { ...ok, id: "x2", title: "壊れた図面", pages: "?" }
  const page = { id: "p1", title: "P", paper: "@matomezu/base:a4", orientation: "landscape" as const }
  const line = { id: "l", item: "@matomezu/line:connector-line", from: "a", to: "b", props: {} }
  const broken = { ...ok, id: "x3", title: "線だけ", pages: [{ ...page, items: [line] }] }
  const done = checkBooks(CORE_CATALOG, [ok, noType, misfit, broken])
  expect(done.books.map(b => b.id)).toEqual([ok.id])
  expect(done.notices.map(noticeText)).toEqual([
    "N004 @foo/stamps: book x1 (スタンプ帳): its type @foo/stamps:board is not in the catalog",
    "N005 @matomezu/drawing: book x2 (壊れた図面): it does not fit its type @matomezu/drawing:drawing",
    "N006 @matomezu/drawing: book x3 (線だけ): it breaks the rules of its type @matomezu/drawing:drawing",
  ])
})
