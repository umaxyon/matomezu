// ページとフォルダの表（core/folders.ts）: ブックを表に分け、表からブックを組み、変わりを表への書き込みに分ける
import { expect, test } from "bun:test"
import { USER } from "../../web/src/core/actor"
import { putBinder, putPage, removePage } from "../../web/src/core/book"
import {
  bookIdOf,
  bookOf,
  changesBetween,
  foldersOver,
  libraryOf,
  recordsOf,
  settledOn,
  tablesOf,
  withChanges,
} from "../../web/src/core/folders"
import { performIn } from "../../web/src/core/perform"
import type { Book } from "../../web/src/core/schema/book"
import { drawingPage, SLIDE, testBinder, testBook, testPage } from "../lineup"
import { CORE_CATALOG, sequence } from "../support"

const box = (id: string) => ({ id, item: "@matomezu/box:shape-nest-box", x: 0, y: 0, props: { caption: id, body: "" } })
const book = testBook("b1", "ブック", [
  drawingPage("p1", { items: [box("a")] }),
  testBinder(
    "f1",
    "スライド",
    SLIDE,
    testPage(SLIDE, "s1", { title: "1 枚目" }),
    testPage(SLIDE, "s2", { title: "2" }),
  ),
  drawingPage("p2", { title: "2" }),
])
const other = testBook("b2", "別", [drawingPage("x1")])

test("ブックは、ブックのフォルダ・バインダ・ページに分かれる。フォルダはエントリの id を順に持ち、ページの中身を持たない", () => {
  const { folders, pages } = recordsOf(book)
  expect(folders).toEqual([
    {
      id: "b1",
      title: "ブック",
      folderRole: "book",
      lineup: [
        { kind: "page", id: "p1" },
        { kind: "binder", id: "f1" },
        { kind: "page", id: "p2" },
      ],
    },
    {
      id: "f1",
      title: "スライド",
      folderRole: "binder",
      pageType: SLIDE,
      lineup: [
        { kind: "page", id: "s1" },
        { kind: "page", id: "s2" },
      ],
    },
  ])
  expect(pages.map(p => p.id)).toEqual(["p1", "s1", "s2", "p2"])
})

test("分けた表から組むと、元のブックの値に戻る（同じ値）。表が変わっていなければ、組んだ一覧も同じ値", () => {
  const tables = tablesOf([book, other])
  expect(bookOf(tables, "b1")).toBe(book)
  expect(libraryOf(tables)).toEqual({ b1: book, b2: other })
  expect(libraryOf(tables)).toBe(libraryOf(tablesOf([book, other])))
  expect(bookOf(tables, "f1")).toBeUndefined()
  expect(bookOf(tables, "nope")).toBeUndefined()
})

test("ページを 1 枚変えると、書くのはそのページだけ。組み直すと、ほかのブック・バインダ・ページは同じ値のまま", () => {
  const next = putPage(book, drawingPage("p1", { title: "改", items: [box("a")] }))
  const changes = changesBetween([book], [next])
  expect(Object.keys(changes.pages)).toEqual(["p1"])
  expect(changes.folders).toEqual({})
  const tables = withChanges(tablesOf([book, other]), changes)
  const made = bookOf(tables, "b1") as Book
  expect(made).toEqual(next)
  expect(made.lineup[1]).toBe(book.lineup[1])
  expect(made.lineup[2]).toBe(book.lineup[2])
  expect(bookOf(tables, "b2")).toBe(other)
})

test("ブックの名前を変えると、書くのはブックのフォルダだけ。バインダの名前ならバインダだけ。中身の同じ値を作り直しただけなら、何も書かない", () => {
  const retitled = changesBetween([book], [{ ...book, title: "改" }])
  expect(retitled.pages).toEqual({})
  expect(Object.keys(retitled.folders)).toEqual(["b1"])
  expect(retitled.folders.b1).toMatchObject({ id: "b1", title: "改", folderRole: "book" })
  const renamed = changesBetween([book], [putBinder(book, "f1", f => ({ ...f, title: "改" }))])
  expect(Object.keys(renamed.folders)).toEqual(["f1"])
  expect(renamed.pages).toEqual({})
  const rebuilt = JSON.parse(JSON.stringify(book)) as Book
  expect(changesBetween([book], [rebuilt])).toEqual({ pages: {}, folders: {} })
})

test("ページを消すと、ページは removed、入れていたフォルダは書き直す。ブックが無くなれば、そのフォルダ・バインダ・ページの全部が removed", () => {
  const removed = changesBetween([book], [removePage(book, "s2")])
  expect(removed.pages).toEqual({ s2: "removed" })
  expect(Object.keys(removed.folders)).toEqual(["f1"])
  const gone = changesBetween([book, other], [other])
  expect(gone).toEqual({
    pages: { p1: "removed", s1: "removed", s2: "removed", p2: "removed" },
    folders: { b1: "removed", f1: "removed" },
  })
  expect(libraryOf(withChanges(tablesOf([book, other]), gone))).toEqual({ b2: other })
})

test("ページを入れているフォルダの列は近い順（バインダ → ブック）。持ち主のブックは、そこから引く", () => {
  const { folders } = tablesOf([book, other])
  expect(foldersOver(folders, "s1").map(f => f.id)).toEqual(["f1", "b1"])
  expect(foldersOver(folders, "p2").map(f => f.id)).toEqual(["b1"])
  expect(foldersOver(folders, "nope")).toEqual([])
  expect(bookIdOf(folders, "s2")).toBe("b1")
  expect(bookIdOf(folders, "x1")).toBe("b2")
})

test("知らされた表は、中身の同じページ・フォルダを今の値に寄せる。全部同じなら今の表のまま", () => {
  const now = tablesOf([book, other])
  const again = tablesOf([JSON.parse(JSON.stringify(book)) as Book, JSON.parse(JSON.stringify(other)) as Book])
  expect(settledOn(again, now)).toBe(now)
  const changed = withChanges(again, changesBetween([other], [{ ...other, title: "改" }]))
  const settled = settledOn(changed, now)
  expect(settled.pages).toBe(now.pages)
  expect(settled.folders.b1).toBe(now.folders.b1)
  expect(settled.folders.b2).not.toBe(now.folders.b2)
})

test("新しく足すページの id が、世界のほかのブックにもう在れば断る（ページは、ちょうど 1 つのフォルダに入る）", () => {
  const world = { ...tablesOf([book, other]), settings: {}, annotations: {}, records: {}, counters: {} }
  const ctx = (ids: string[]) => ({
    catalog: CORE_CATALOG,
    controlCenter: null,
    lang: "en" as const,
    newId: () => ids.shift() ?? sequence()(),
    now: "2026-01-01T00:00:00.000Z",
    actor: USER,
  })
  const add = (ids: string[]) =>
    performIn(
      world,
      "@matomezu/base:page-add",
      { type: "@matomezu/drawing:drawing", title: "足す" },
      { book: "b2" },
      ctx(ids),
    )
  // b1 のページの id と重なる
  expect(add(["p1"])).toEqual({ ok: false, reason: "refused" })
  // b1 のバインダの id、ブックの id とも重ならない
  expect(add(["f1"])).toEqual({ ok: false, reason: "refused" })
  expect(add(["b1"])).toEqual({ ok: false, reason: "refused" })
  const done = add(["fresh"])
  expect(done).toMatchObject({ ok: true, result: { page: "fresh" } })
  if (!done.ok) return
  expect(Object.keys(done.changes?.pages ?? {})).toEqual(["fresh"])
  expect(Object.keys(done.changes?.folders ?? {})).toEqual(["b2"])
})
