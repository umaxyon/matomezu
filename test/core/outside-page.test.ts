// ブックの外のページをステージで開く（core/stage.ts の openOutsidePage・followOutsidePage、core/workspace.ts の followLibrary）
import { expect, test } from "bun:test"
import { HOME_ID, type Library, TRASH_ID } from "../../web/src/core/folders"
import { outsidePageIn } from "../../web/src/core/folders-tree"
import { newStage, openOutsidePage, select, shownPageId } from "../../web/src/core/stage"
import { followLibrary, NO_STAGES_LEFT, newWorkspace, split } from "../../web/src/core/workspace"
import { drawingPage, testBook } from "../lineup"
import { CORE_CATALOG } from "../support"

const x1 = drawingPage("x1", { title: "ブックの外のページ" })

// 書庫ホームにブックの外のページ x1。trashed なら、x1 はゴミ箱の中
function library(page = x1, trashed = false): Library {
  const entry = { kind: "page" as const, id: "x1" }
  const lost = { ...entry, trashed: "2026-01-01T00:00:00.000Z", from: [HOME_ID] }
  return {
    pages: { x1: page },
    folders: {
      [HOME_ID]: { folderRole: "home", id: HOME_ID, lineup: trashed ? [] : [entry] },
      [TRASH_ID]: { folderRole: "trash", id: TRASH_ID, lineup: trashed ? [lost] : [] },
    },
  }
}

test("開けるブックの外のページは、ブックにもバインダにも入っていない、ゴミ箱のブックの外のページ", () => {
  expect(outsidePageIn(library(), "x1")).toBe(x1)
  expect(outsidePageIn(library(x1, true), "x1")).toBeUndefined()
  expect(outsidePageIn(library(), "nothing")).toBeUndefined()
  expect(outsidePageIn(library(), HOME_ID)).toBeUndefined()
})

test("ブックの外のページを開くと、ステージエントリはそのページ。もう開いていれば同じ値", () => {
  const opened = openOutsidePage(CORE_CATALOG, newStage("s1"), x1)
  expect(opened.opened).toMatchObject({
    kind: "page",
    outermost: { kind: "page", id: "x1" },
    page: "x1",
    type: x1.type,
  })
  expect(openOutsidePage(CORE_CATALOG, opened, x1)).toBe(opened)
})

test("書庫が変わると、ブックの外のページを開いたステージは、ページが残っていれば合わせ、ゴミ箱に入るか無くなれば閉じる", () => {
  const book = testBook("b1", "見本", [drawingPage("p1")])
  const ws = split(newWorkspace(CORE_CATALOG, book), "s2")
  const open = (s: (typeof ws.stages)[number]) => (s.id === "s2" ? openOutsidePage(CORE_CATALOG, s, x1) : s)
  const plain = { ...ws, stages: ws.stages.map(open) }
  const shows = { ...ws, stages: plain.stages.map(s => (s.id === "s2" ? select(s, ["gone"]) : s)) }
  const books = { b1: book }
  expect(followLibrary(CORE_CATALOG, plain, { books, ...library() })).toBe(plain)
  // 残っていれば開いたまま。ページに無い物は選択から外す
  const kept = followLibrary(CORE_CATALOG, shows, { books, ...library({ ...x1, title: "改名" }) })
  expect(kept === NO_STAGES_LEFT ? kept : kept.stages.map(s => [shownPageId(s.opened), s.selection])).toEqual([
    ["p1", []],
    ["x1", []],
  ])
  for (const gone of [library(x1, true), { pages: {}, folders: library().folders }]) {
    const left = followLibrary(CORE_CATALOG, shows, { books, ...gone })
    expect(left === NO_STAGES_LEFT ? left : left.stages.map(s => shownPageId(s.opened))).toEqual(["p1"])
  }
  // ブックも無くなれば、ステージは 1 つも残らない
  expect(followLibrary(CORE_CATALOG, shows, { books: {}, ...library(x1, true) })).toBe(NO_STAGES_LEFT)
})
