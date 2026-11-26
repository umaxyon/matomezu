// ステージで参照エントリを開く: 開く・最初の並び・消えたときの隣・指すバインダのページが消えたとき・広さの知らせ
import { expect, test } from "bun:test"
import { NO_PAGE } from "../../web/src/core/book"
import { bookOf } from "../../web/src/core/folders-books"
import type { ReferenceEntry } from "../../web/src/core/schema/book"
import {
  areaOf,
  followBook,
  followReference,
  NO_AREA,
  NO_PAPER,
  NO_REFERENCE,
  newStage,
  openBook,
  openedPage,
  openedReference,
  openPage,
  openReference,
  setReferenceArea,
} from "../../web/src/core/stage"
import { drawingPage, SLIDE, testBinder, testBook, testPage } from "../lineup"
import { CORE_CATALOG, libraryWith } from "../support"

const ref = (id: string, kind: "page" | "binder", of: string): ReferenceEntry => ({
  kind: "reference",
  id,
  of: { kind, id: of },
})
const slides = testBinder("x1", "説明", SLIDE, testPage(SLIDE, "s1"), testPage(SLIDE, "s2"), testPage(SLIDE, "s3"))
const A = testBook("A", "A", [drawingPage("a1"), slides])
const B = testBook("B", "B", [drawingPage("b1"), ref("r1", "page", "a1"), ref("r2", "binder", "x1"), drawingPage("b2")])
const library = libraryWith([A, B])

const refOf = (s: ReturnType<typeof newStage>) => {
  const o = openedReference(s.opened)
  if (o === NO_REFERENCE) throw new Error("no reference")
  return o
}

test("参照のタブを開くと参照を開いた形になり、ページは開かない（選ぶ・置くは始まらない）", () => {
  const s = openReference(openBook(CORE_CATALOG, newStage("s1"), B), B, "r1")
  expect(refOf(s).reference).toBe("r1")
  expect(openedPage(s.opened)).toBe(NO_PAGE)
  expect(areaOf(s)).toBe(NO_PAPER)
  expect(openReference(s, B, "none")).toBe(s)
})

test("並びの最初が参照エントリなら、ブックを開くとそれを開く", () => {
  const first = testBook("C", "C", [ref("r9", "page", "a1"), drawingPage("c1")])
  expect(refOf(openBook(CORE_CATALOG, newStage("s1"), first)).reference).toBe("r9")
})

test("知らせた広さで描く範囲が決まり、描く物が無ければ広さを捨てる", () => {
  const s = setReferenceArea(openReference(openBook(CORE_CATALOG, newStage("s1"), B), B, "r1"), { w: 300, h: 200 })
  expect(areaOf(s)).toEqual({ w: 300, h: 200 })
  expect(refOf(setReferenceArea(s, null)).area).toBe(NO_AREA)
})

test("開いている参照エントリが消えたら隣のタブ、隣が参照ならそれを開く", () => {
  const s = openReference(openBook(CORE_CATALOG, newStage("s1"), B), B, "r1")
  const without = testBook("B", "B", [drawingPage("b1"), ref("r2", "binder", "x1"), drawingPage("b2")])
  expect(refOf(followBook(CORE_CATALOG, s, without, B)).reference).toBe("r2")
  const onPage = openPage(CORE_CATALOG, openBook(CORE_CATALOG, newStage("s1"), B), B, "b2")
  const lastGone = testBook("B", "B", [drawingPage("b1"), ref("r1", "page", "a1"), ref("r2", "binder", "x1")])
  expect(refOf(followBook(CORE_CATALOG, onPage, lastGone, B)).reference).toBe("r2")
})

test("指すバインダで選んだページが消えたら、後ろの残りのページにする", () => {
  const s = setReferenceArea(openReference(openBook(CORE_CATALOG, newStage("s1"), B), B, "r2", "s2"), { w: 9, h: 9 })
  expect(followReference(s, B, library, library)).toBe(s)
  const fewer = testBinder("x1", "説明", SLIDE, testPage(SLIDE, "s1"), testPage(SLIDE, "s3"))
  const now = libraryWith([testBook("A", "A", [drawingPage("a1"), fewer]), B])
  const next = refOf(followReference(s, bookOf(now, "B") ?? B, now, library))
  expect(next.chosen).toBe("s3")
  expect(next.area).toBe(NO_AREA)
})
