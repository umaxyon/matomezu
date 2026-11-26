// ブックの外のバインダをステージで開く（core/stage.ts の openOutsideBinder・followOutsideBinder・followInto、core/workspace.ts の followLibrary）
import { expect, test } from "bun:test"
import { type AnyEntryRef, type Folder, HOME_ID, type Library, TRASH_ID } from "../../web/src/core/folders"
import { outsideBinderIn } from "../../web/src/core/folders-tree"
import { type LibraryAndBooks, openablePage } from "../../web/src/core/library"
import {
  askedOutermostOf,
  newStage,
  openedEntry,
  openedPageById,
  openOutsideBinder,
  openPrintPreview,
  select,
  shownPageId,
} from "../../web/src/core/stage"
import { followLibrary, NO_STAGES_LEFT, newWorkspace, type Workspace } from "../../web/src/core/workspace"
import { drawingPage, testBinder, testBook } from "../lineup"
import { CORE_CATALOG } from "../support"

const [s1, s2, s3] = [drawingPage("s1"), drawingPage("s2"), drawingPage("s3")]
const page = (id: string) => ({ kind: "page" as const, id })
const binder = (id: string, ...ids: string[]): Folder => ({
  folderRole: "binder",
  id,
  title: id,
  pageType: s1.type,
  lineup: ids.map(page),
})

// 書庫ホームに、ブックの外のバインダ n1（中は ids のページ）。rest は、ほかのフォルダの行と書庫ホームの並び
function library(ids = ["s1", "s2", "s3"], rest: { folders?: Folder[]; home?: AnyEntryRef[] } = {}): Library {
  const home = rest.home ?? [{ kind: "binder" as const, id: "n1" }]
  const folders: Record<string, Folder> = {
    [HOME_ID]: { folderRole: "home", id: HOME_ID, lineup: home },
    [TRASH_ID]: { folderRole: "trash", id: TRASH_ID, lineup: [] },
    n1: binder("n1", ...ids),
  }
  for (const f of rest.folders ?? []) folders[f.id] = f
  return { pages: { s1, s2, s3 }, folders }
}
const withBooks = (l: Library): LibraryAndBooks => ({ ...l, books: {} })

// n1 の page を開いたステージ 1 つの並び
function opened(at?: string): Workspace {
  const ws = newWorkspace(CORE_CATALOG, null)
  const n1 = outsideBinderIn(library(), "n1")
  if (!n1) throw new Error("no binder")
  return { ...ws, stages: ws.stages.map(s => openOutsideBinder(CORE_CATALOG, s, n1, at)) }
}
const shown = (ws: Workspace | typeof NO_STAGES_LEFT) =>
  ws === NO_STAGES_LEFT ? ws : ws.stages.map(s => [openedEntry(s.opened), shownPageId(s.opened)])

test("開けるブックの外のバインダは、ブックに入っていない、ゴミ箱の中でない、中のページが全部在るバインダ", () => {
  expect(outsideBinderIn(library(), "n1")).toMatchObject({ kind: "binder", id: "n1", lineup: [s1, s2, s3] })
  expect(outsideBinderIn(library(), "s1")).toBeUndefined()
  expect(outsideBinderIn(library(["s1", "nothing"]), "n1")).toBeUndefined()
  const trash: Folder = {
    folderRole: "trash",
    id: TRASH_ID,
    lineup: [{ kind: "binder", id: "n1", trashed: "2026-01-01T00:00:00.000Z", from: [HOME_ID] }],
  }
  expect(outsideBinderIn(library(undefined, { folders: [trash], home: [] }), "n1")).toBeUndefined()
  const book: Folder = { folderRole: "book", id: "b1", title: "ブック", lineup: [{ kind: "binder", id: "n1" }] }
  const inBook = library(undefined, { folders: [book], home: [{ kind: "book", id: "b1" }] })
  expect(outsideBinderIn(inBook, "n1")).toBeUndefined()
})

test("ブックの外のバインダを開くと、ステージエントリはそのバインダで、最初のページか名指したページ。問う相手と中のページは開いているページから引く", () => {
  const n1 = testBinder("n1", "n1", s1.type, s1, s2, s3)
  const first = openOutsideBinder(CORE_CATALOG, newStage("st"), n1)
  expect(first.opened).toMatchObject({ kind: "page", outermost: { kind: "binder", id: "n1" }, page: "s1" })
  expect(openOutsideBinder(CORE_CATALOG, first, n1)).toBe(first)
  expect(openOutsideBinder(CORE_CATALOG, first, n1, "s1")).toBe(first)
  const second = openOutsideBinder(CORE_CATALOG, first, n1, "s2")
  expect(second.opened).toMatchObject({ outermost: { kind: "binder", id: "n1" }, page: "s2" })
  // もう開いているバインダを、ページを名指さずに開いても、開いているページは替えない
  expect(openOutsideBinder(CORE_CATALOG, second, n1)).toBe(second)
  // 印刷プレビューの間に、開いているページを名指すと閉じる。ほかのページを名指すと、閉じてそのページへ替える
  const previewing = openPrintPreview(second)
  expect(openOutsideBinder(CORE_CATALOG, previewing, n1, "s2")).toMatchObject({
    mode: { kind: "edit" },
    opened: second.opened,
  })
  expect(openOutsideBinder(CORE_CATALOG, previewing, n1, "s3")).toMatchObject({
    mode: { kind: "edit" },
    opened: { page: "s3" },
  })
  expect(openOutsideBinder(CORE_CATALOG, previewing, n1).mode.kind).toBe("print-preview")
  // そのバインダに無いページを名指したら、最初のページ
  expect(shownPageId(openOutsideBinder(CORE_CATALOG, newStage("st"), n1, "nothing").opened)).toBe("s1")

  const from = withBooks(library())
  expect(askedOutermostOf(from, second.opened)).toMatchObject({ page: s2 })
  expect(openedPageById(from, { outermost: "n1" }, "s3")).toBe(s3)
  expect(openedPageById(from, { outermost: "n1" }, "nothing")).toBeNull()
  expect(openedPageById(from, { outermost: "other" }, "s3")).toBeNull()
})

test("書庫が変わると、ブックの外のバインダを開いたステージは、ページが残っていれば合わせ、無くなれば隣、バインダがゴミ箱に入るか無くなれば閉じる", () => {
  const before = withBooks(library())
  const plain = opened("s2")
  expect(followLibrary(CORE_CATALOG, plain, before, before)).toBe(plain)
  // ページに無い物は選択から外す
  const picked = { ...plain, stages: plain.stages.map(s => select(s, ["gone"])) }
  const kept = followLibrary(CORE_CATALOG, picked, before, before)
  expect(kept === NO_STAGES_LEFT ? kept : kept.stages.map(s => s.selection)).toEqual([[]])

  const n1 = { kind: "binder" as const, id: "n1" }
  // 開いていたページが消えたら、後ろにあったページ。後ろに無ければ前にあったページ
  const gone = (ids: string[]) => {
    const now = library(ids)
    return { ...now, pages: Object.fromEntries(ids.map(id => [id, now.pages[id]])), books: {} } as LibraryAndBooks
  }
  expect(shown(followLibrary(CORE_CATALOG, plain, gone(["s1", "s3"]), before))).toEqual([[n1, "s3"]])
  expect(shown(followLibrary(CORE_CATALOG, opened("s3"), gone(["s1", "s2"]), before))).toEqual([[n1, "s2"]])
  // バインダごと別のフォルダへ移っても、開いたまま
  const folder: Folder = { folderRole: "folder", id: "f1", title: "フォルダ", lineup: [{ kind: "binder", id: "n1" }] }
  const moved = withBooks(library(undefined, { folders: [folder], home: [{ kind: "folder", id: "f1" }] }))
  expect(followLibrary(CORE_CATALOG, plain, moved, before)).toBe(plain)
  // バインダが無くなれば閉じる
  const none = withBooks(library(undefined, { home: [] }))
  delete (none.folders as Record<string, Folder>).n1
  expect(followLibrary(CORE_CATALOG, plain, none, before)).toBe(NO_STAGES_LEFT)
})

test("開いていたページがよそへ移されたら: ブックの中か別のブックの外のバインダなら移った先で開き直し、バインダごとブックへ入っても開き直す", () => {
  const before = withBooks(library())
  const plain = opened("s2")
  // 開いていたページだけが別のブックの外のバインダへ移り、元のバインダにページが残る: 元のバインダの隣のページ
  const other = library(["s1", "s3"], {
    folders: [binder("n2", "s2")],
    home: [
      { kind: "binder", id: "n1" },
      { kind: "binder", id: "n2" },
    ],
  })
  expect(shown(followLibrary(CORE_CATALOG, plain, withBooks(other), before))).toEqual([
    [{ kind: "binder", id: "n1" }, "s3"],
  ])
  // 最後の 1 枚が別のバインダへ移り、元のバインダが消えた: 移った先のバインダで開き直す
  const last = library([], { folders: [binder("n2", "s1", "s2", "s3")], home: [{ kind: "binder", id: "n2" }] })
  delete (last.folders as Record<string, Folder>).n1
  expect(shown(followLibrary(CORE_CATALOG, plain, withBooks(last), before))).toEqual([
    [{ kind: "binder", id: "n2" }, "s2"],
  ])
  // バインダごとブックの中へ: そのブックのページとして開き直す
  const book = testBook("b1", "ブック", [testBinder("n1", "n1", s1.type, s1, s2, s3)])
  const bookRow: Folder = { folderRole: "book", id: "b1", title: "ブック", lineup: [{ kind: "binder", id: "n1" }] }
  const inBook = library(undefined, { folders: [bookRow], home: [{ kind: "book", id: "b1" }] })
  expect(shown(followLibrary(CORE_CATALOG, plain, { ...inBook, books: { b1: book } }, before))).toEqual([
    [{ kind: "book", id: "b1" }, "s2"],
  ])
})

test("id のページを、ステージで開ける所から引く（ブックの中・ブックの外のバインダの中・ブックの外のページ 1 枚。ゴミ箱の中と無いページは引かない）", () => {
  const o1 = drawingPage("o1")
  const p1 = drawingPage("p1")
  const b1 = testBook("b1", "B1", [p1])
  const row: Folder = { folderRole: "book", id: "b1", title: "B1", lineup: [page("p1")] }
  const l = library(undefined, {
    folders: [row],
    home: [{ kind: "binder", id: "n1" }, page("o1"), { kind: "book", id: "b1" }],
  })
  const from: LibraryAndBooks = { ...l, pages: { ...l.pages, o1, p1 }, books: { b1 } }
  expect(openablePage(from, "p1")).toEqual({ outermost: { kind: "book", id: "b1" }, page: p1 })
  expect(openablePage({ ...from, books: {} }, "p1")).toBeUndefined()
  expect(openablePage(from, "s2")).toEqual({ outermost: { kind: "binder", id: "n1" }, page: s2 })
  expect(openablePage(from, "o1")).toEqual({ outermost: { kind: "page", id: "o1" }, page: o1 })
  expect(openablePage(from, "nothing")).toBeUndefined()
  const trash: Folder = {
    folderRole: "trash",
    id: TRASH_ID,
    lineup: [{ kind: "binder", id: "n1", trashed: "2026-01-01T00:00:00.000Z", from: [HOME_ID] }],
  }
  expect(openablePage(withBooks(library(undefined, { folders: [trash], home: [] })), "s2")).toBeUndefined()
})
