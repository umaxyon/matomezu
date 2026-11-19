// ブックの外のページ（どのブックにも入っていないページ）も、行う前の問いと行った後の確かめに掛かる。
// 外のページは、テストの用意として書庫の表に直に置く（作る道のアクションは通さない）
import { expect, test } from "bun:test"
import { USER } from "../../web/src/core/actor"
import type { ActionDef } from "../../web/src/core/def/action"
import { type AnyEntryRef, HOME_ID, type Library, tablesOf } from "../../web/src/core/folders"
import { brokenIn, pageChecksBetween } from "../../web/src/core/perform"
import type { AnyPage, Book } from "../../web/src/core/schema/book"
import { drawingPage, testBook } from "../lineup"
import { CORE_CATALOG, sequence } from "../support"

const LOCK = "@matomezu/base:lock"
const MOVE = "@matomezu/base:entry-move"

const ctxOf = () =>
  ({
    catalog: CORE_CATALOG,
    controlCenter: null,
    lang: "en" as const,
    newId: sequence(),
    now: "2026-01-01T00:00:00.000Z",
    today: "2026-01-01",
    actor: USER,
  }) as never

// ブック books と、書庫ホームの直下に置いたブックの外のページ outside の書庫（ホームの並びは、ブックのあとに外のページ）
function libraryWith(books: readonly Book[], outside: readonly AnyPage[]): Library {
  const tables = tablesOf(books)
  const lineup: AnyEntryRef[] = [
    ...books.map(b => ({ kind: "book" as const, id: b.id })),
    ...outside.map(p => ({ kind: "page" as const, id: p.id })),
  ]
  return {
    pages: { ...tables.pages, ...Object.fromEntries(outside.map(p => [p.id, p])) },
    folders: { ...tables.folders, [HOME_ID]: { folderRole: "home", id: HOME_ID, lineup } },
  }
}

test("ブックとの間を出入りしたページは、ブックの側とページの側の両方で確かめる（ブックの側が見ない、入ったロックしたページの変化も止まる）", () => {
  const move = CORE_CATALOG.actions.get(MOVE) as ActionDef
  const p1 = drawingPage("p1", { title: "中", locked: true })
  const x1 = drawingPage("x1", { title: "外", locked: true })
  const was = libraryWith([testBook("b1", "ブック", [p1, drawingPage("p2", { title: "2" })])], [x1])
  // 中身を変えずに出し入れする: どちらも通る
  const swapped = libraryWith([testBook("b1", "ブック", [x1, drawingPage("p2", { title: "2" })])], [p1])
  expect(brokenIn(ctxOf(), move, was, swapped)).toBeNull()
  // ページの側の確かめは、出入りした 2 枚（ブックの中だけの p2 は入らない）
  const checks = pageChecksBetween(was, swapped)
  expect(checks.map(c => [c.change.id, c.change.change, c.place])).toEqual([
    ["p1", "changed", "moved"],
    ["x1", "changed", "moved"],
  ])
  expect(checks.map(c => [c.folders.before.map(f => f.id), c.folders.after.map(f => f.id)])).toEqual([
    [["b1"], []],
    [[], ["b1"]],
  ])
  // 外から入ったロックしたページの名前を変える: ブックの側は前のブックに無いページなので見ず、ページの側が止める
  const renamedIn = libraryWith(
    [testBook("b1", "ブック", [{ ...x1, title: "改" }, drawingPage("p2", { title: "2" })])],
    [p1],
  )
  expect(brokenIn(ctxOf(), move, was, renamedIn)).toEqual({ permission: LOCK })
  // 外へ出たロックしたページの名前を変える: ブックの側（movedOut）が止める
  const renamedOut = libraryWith(
    [testBook("b1", "ブック", [x1, drawingPage("p2", { title: "2" })])],
    [{ ...p1, title: "改" }],
  )
  expect(brokenIn(ctxOf(), move, was, renamedOut)).toEqual({ permission: LOCK, book: "b1" })
})
