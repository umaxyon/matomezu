// 名前とタイプだけを読む所のための、ページの表の行の引き方（中身を持っていない、ページメタだけの行でも引く）
import { expect, test } from "bun:test"
import {
  type Folder,
  HOME_ID,
  type HomeFolder,
  type Library,
  pageMetaRowOf,
  TRASH_ID,
} from "../../../web/src/core/folders"
import type { AnyPage } from "../../../web/src/core/schema/book"
import { openablePageRow } from "../../../web/src/plugins/base/utils/page-row"
import { drawingPage, SLIDE, testBinder, testBook, testPage } from "../../lineup"
import { libraryWith } from "../../support"

// ブック A（図 a1 と、スライドのバインダ x1）と、ブック B（図 b1）と、ブックの外の図 o1。unheld の行は中身を持っていない行にする
function start(...unheld: string[]): Library {
  const library = libraryWith(
    [
      testBook("A", "A", [
        drawingPage("a1", { title: "全体図" }),
        testBinder("x1", "説明", SLIDE, testPage(SLIDE, "s1", { title: "1" }) as AnyPage),
      ]),
      testBook("B", "B", [drawingPage("b1", { title: "設計" })]),
    ],
    [drawingPage("o1", { title: "外" })],
  )
  const pages = { ...library.pages }
  for (const id of unheld) pages[id] = pageMetaRowOf(pages[id]!)
  return { ...library, pages }
}

test("openablePageRow は、中身を持っていないページの行も開ける所から引き、ゴミ箱の中・読めないブックのページは引かない", () => {
  const world = start("a1", "b1", "o1")
  expect(openablePageRow(world, "a1")?.outermost).toEqual({ kind: "book", id: "A" })
  expect(openablePageRow(world, "s1")?.row.title).toBe("1")
  expect(openablePageRow(world, "o1")?.outermost).toEqual({ kind: "page", id: "o1" })
  const home = world.folders[HOME_ID] as HomeFolder
  const trashed: Library = {
    pages: world.pages,
    folders: {
      ...world.folders,
      [HOME_ID]: { ...home, lineup: home.lineup.filter(r => r.id !== "B" && r.id !== "o1") },
      [TRASH_ID]: {
        folderRole: "trash",
        id: TRASH_ID,
        lineup: [
          { kind: "book", id: "B" },
          { kind: "page", id: "o1" },
        ],
      } as unknown as Folder,
    },
  }
  expect(openablePageRow(trashed, "b1")).toBeUndefined()
  expect(openablePageRow(trashed, "o1")).toBeUndefined()
  const { s1: _, ...lost } = world.pages
  expect(openablePageRow({ pages: lost, folders: world.folders }, "a1")).toBeUndefined()
})
