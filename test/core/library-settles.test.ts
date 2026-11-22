import { expect, test } from "bun:test"
import { outsideHolds } from "../../web/src/core/book"
import {
  HOME_ID,
  type HomeFolder,
  type Library,
  type PlainFolder,
  TRASH_ID,
  type TrashFolder,
} from "../../web/src/core/folders"
import { librarySettles } from "../../web/src/core/perform-checks"
import { DRAWING, drawingPage, SLIDE, testBinder, testBook, testPage } from "../lineup"
import { SAMPLE_BOOKS } from "../sample-books"
import { CORE_CATALOG, libraryWith } from "../support"

const book = SAMPLE_BOOKS[0]!
const before = { [book.id]: book }

test("一覧が対象のアクションの結果は、変わったブックが形に合い、置いた鍵がブックの id と同じときだけ通る", () => {
  expect(librarySettles(CORE_CATALOG, before, before)).toBe(true)
  expect(librarySettles(CORE_CATALOG, before, { [book.id]: { ...book, title: "変えた" } })).toBe(true)
  // 形に合わない（土台のフィールドが違う・タイプの形に無いフィールド）
  expect(librarySettles(CORE_CATALOG, before, { [book.id]: { ...book, color: "red" } as never })).toBe(false)
  expect(librarySettles(CORE_CATALOG, before, { [book.id]: { ...book, title: 1 } as never })).toBe(false)
  // 鍵と id が違う
  expect(librarySettles(CORE_CATALOG, before, { ...before, other: book })).toBe(false)
  // 増やしたブックも確かめる
  const other = { ...SAMPLE_BOOKS[1]!, id: "other" }
  expect(librarySettles(CORE_CATALOG, before, { ...before, other })).toBe(true)
  expect(librarySettles(CORE_CATALOG, before, { ...before, other: { ...other, color: "x" } as never })).toBe(false)
  // ほかのブックのページと同じ id のページを持つブックは増やせない（ページは、ちょうど 1 つのフォルダに入る）
  expect(librarySettles(CORE_CATALOG, before, { ...before, other: { ...book, id: "other" } })).toBe(false)
})

// ブックの外の決まり（outsideHolds）: 変わったフォルダの行に関わる所だけを、ゴミ箱の外で見る
const slide = (id: string, rest: object = {}) => testPage(SLIDE, id, { title: id, ...rest })
const changed = (library: Library): Library => ({
  pages: library.pages,
  folders: Object.fromEntries(Object.entries(library.folders).map(([id, f]) => [id, { ...f }])),
})
const holdsOutside = (library: Library) => outsideHolds(CORE_CATALOG, { pages: {}, folders: {} }, library)

test("書庫ホーム・フォルダの直下に、まとまるタイプのページ（スライド）が裸で在れば断る。まとまらないタイプのページは通る", () => {
  expect(holdsOutside(libraryWith([], [drawingPage("x1")]))).toBe(true)
  expect(holdsOutside(libraryWith([], [slide("y1")]))).toBe(false)
  const inFolder = libraryWith([], [drawingPage("x1")])
  const folder: PlainFolder = { folderRole: "folder", id: "a", title: "あ", lineup: [{ kind: "page", id: "y1" }] }
  const home = inFolder.folders[HOME_ID] as HomeFolder
  const withSlide: Library = {
    pages: { ...inFolder.pages, y1: slide("y1") },
    folders: {
      ...inFolder.folders,
      a: folder,
      [HOME_ID]: { ...home, lineup: [...home.lineup, { kind: "folder", id: "a" }] },
    },
  }
  expect(holdsOutside(withSlide)).toBe(false)
})

test("ブックの外のバインダは、バインダの決まり（入れるタイプ・紙と向き）を守り、空でないときだけ通る。ブックの中のバインダは空でもよい", () => {
  expect(holdsOutside(libraryWith([], [testBinder("lb", "束", SLIDE, slide("y1"), slide("y2"))]))).toBe(true)
  const paper = testBinder("lb", "束", SLIDE, slide("y1"), slide("y2", { orientation: "portrait" }))
  expect(holdsOutside(libraryWith([], [paper]))).toBe(false)
  expect(holdsOutside(libraryWith([], [testBinder("lb", "束", DRAWING, drawingPage("x1"))]))).toBe(false)
  expect(holdsOutside(libraryWith([], [testBinder("lb", "束", SLIDE)]))).toBe(false)
  expect(holdsOutside(libraryWith([testBook("b1", "B", [drawingPage("p1"), testBinder("bd", "空", SLIDE)])]))).toBe(
    true,
  )
})

test("ブックの外の決まりは、行う前から変わらないフォルダの行と、ゴミ箱の中では見ない", () => {
  const broken = libraryWith([], [slide("y1"), testBinder("lb", "束", SLIDE)])
  expect(outsideHolds(CORE_CATALOG, broken, broken)).toBe(true)
  expect(outsideHolds(CORE_CATALOG, broken, changed(broken))).toBe(false)
  const home: HomeFolder = { folderRole: "home", id: HOME_ID, lineup: [] }
  const trash: TrashFolder = {
    folderRole: "trash",
    id: TRASH_ID,
    lineup: [
      { kind: "page", id: "y1", trashed: "2026-11-22T00:00:00.000Z", from: [HOME_ID] },
      { kind: "binder", id: "lb", trashed: "2026-11-22T00:00:00.000Z", from: [HOME_ID] },
    ],
  }
  const trashed: Library = { pages: broken.pages, folders: { ...broken.folders, [HOME_ID]: home, [TRASH_ID]: trash } }
  expect(holdsOutside(trashed)).toBe(true)
})
