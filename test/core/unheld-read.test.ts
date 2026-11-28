// 窓の書庫の読み口: 中身を持っていない行（ページメタだけの行）を含むブック・ブックの外のページ・ブックの外のバインダは、読めるかを判じず、形だけを確かめて行のまま表に入れる。
// 常駐の読み方（metaRows を渡さない）では、そうした行は形に合わない物として判じる

import { expect, test } from "bun:test"
import { readLibrary } from "../../web/src/core/book"
import { pageMetaRowOf } from "../../web/src/core/folders"
import type { AnyPage } from "../../web/src/core/schema/book"
import { drawingPage, SLIDE, testBinder, testBook, testPage } from "../lineup"
import { CORE_CATALOG, worldRows } from "../support"

// ブック A（図 a1 と、スライドのバインダ x1）と、ブック B（図 b1）と、ブックの外の図 o1 とスライドのバインダ y1。meta の行はページメタだけにする
function rows(meta: readonly string[], broken: (row: Record<string, unknown>) => Record<string, unknown> = r => r) {
  const all = worldRows(
    [
      testBook("A", "A", [
        drawingPage("a1", { title: "全体図" }),
        testBinder("x1", "説明", SLIDE, testPage(SLIDE, "s1", { title: "1" }) as AnyPage),
      ]),
      testBook("B", "B", [drawingPage("b1", { title: "設計" })]),
    ],
    [
      drawingPage("o1", { title: "外" }),
      testBinder("y1", "外の説明", SLIDE, testPage(SLIDE, "t1", { title: "2" }) as AnyPage),
    ],
  )
  return {
    pages: all.pages.map(p => {
      const id = (p as { id: string }).id
      return meta.includes(id) ? broken({ ...pageMetaRowOf(p as AnyPage) }) : p
    }),
    folders: all.folders,
  }
}
const windowRead = (r: ReturnType<typeof rows>) => readLibrary(CORE_CATALOG, r.pages, r.folders, { metaRows: true })

test("持っている行と中身を持っていない行の混じるブックは、判じずに行のまま入り、W028 は出ず、ブックは組まない", () => {
  const read = windowRead(rows(["s1"]))
  expect(read.warnings).toEqual([])
  expect(read.library.pages.s1).toMatchObject({ id: "s1", unheld: true })
  expect(read.library.pages.a1).toMatchObject({ id: "a1", title: "全体図" })
  expect(read.library.pages.a1 && "unheld" in read.library.pages.a1).toBe(false)
  expect(read.library.folders.A?.folderRole).toBe("book")
  expect(read.library.folders.x1?.folderRole).toBe("binder")
  expect(read.books.map(b => b.id)).toEqual(["B"])
})

test("ブックの外のページの、中身を持っていない行は、表に入る", () => {
  const read = windowRead(rows(["o1"]))
  expect(read.library.pages.o1).toMatchObject({ id: "o1", unheld: true })
  expect(read.warnings).toEqual([])
})

test("ブックの外のバインダの、中身を持っていない行は、バインダの行ごと入る", () => {
  const read = windowRead(rows(["t1"]))
  expect(read.library.pages.t1).toMatchObject({ id: "t1", unheld: true })
  expect(read.library.folders.y1?.folderRole).toBe("binder")
})

test("中身を持っていない行が形に合わなければ、それを含む物は表に入らず、warning も出ない", () => {
  const read = windowRead(rows(["a1", "o1"], r => ({ ...r, type: "nobody:none" })))
  expect(read.library.folders.A).toBeUndefined()
  expect(read.library.pages.a1).toBeUndefined()
  expect(read.library.pages.s1).toBeUndefined()
  expect(read.library.pages.o1).toBeUndefined()
  expect(read.warnings).toEqual([])
  expect(read.library.folders.B?.folderRole).toBe("book")
})

test("常駐の読み方では、中身を持っていない行を含むブックは形に合わない（W028）", () => {
  const r = rows(["a1"])
  const read = readLibrary(CORE_CATALOG, r.pages, r.folders)
  expect(read.library.folders.A).toBeUndefined()
  expect(read.warnings.map(w => [w.code, w.params.book])).toEqual([["W028", "A"]])
})
