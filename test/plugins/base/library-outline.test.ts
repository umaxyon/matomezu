// 書庫の画面が描く物（base/library/outline.ts）: フォルダの直下の行・パンくず・行を開いたときの行き先
import { expect, test } from "bun:test"
import { entriesIn } from "../../../web/src/core/entries"
import { HOME_ID, TRASH_ID } from "../../../web/src/core/folders"
import { restorePlanOf, SAME_TITLE } from "../../../web/src/plugins/base/library/entries"
import { FOLDER_CREATE } from "../../../web/src/plugins/base/library/entry-move"
import {
  NO_TYPE,
  NOT_OPENED,
  openedFolderOf,
  openTargetOf,
  pathTo,
  rowsIn,
  shownFoldersOf,
  trashRowsOf,
  treeCurrentOf,
  treeRowsOf,
} from "../../../web/src/plugins/base/library/outline"
import { newStore } from "../../support"

const NOW = "2026-11-18T01:00:00.000Z"

function setup() {
  const store = newStore({ now: () => NOW })
  const perform = store.actions.perform as (id: string, args: unknown) => { ok: boolean; result?: unknown }
  const made = perform(FOLDER_CREATE.id, { title: "仕事" })
  const folder = (made.result as { folder: string }).folder
  expect(perform("@matomezu/base:entry-move", { entry: "b2", into: folder }).ok).toBe(true)
  return { store, perform, folder, library: () => store.state.getState() }
}

test("フォルダの直下の行は、並びの順に、種類・名前・ページのタイプを持つ。無いフォルダは空", () => {
  const { library, folder } = setup()
  const home = rowsIn(library(), HOME_ID)
  expect(home.map(r => r.kind)).toContain("folder")
  expect(home.find(r => r.id === folder)).toEqual({
    kind: "folder",
    id: folder,
    title: "仕事",
    type: NO_TYPE,
    readable: true,
  })
  expect(home.some(r => r.id === "b2")).toBe(false)
  expect(rowsIn(library(), folder).map(r => [r.kind, r.id])).toEqual([["book", "b2"]])
  const pages = rowsIn(library(), "b1")
  expect(pages[0]).toMatchObject({ kind: "page", id: "p1", readable: true })
  expect(pages[0]?.type).not.toBe(NO_TYPE)
  expect(rowsIn(library(), "nothing")).toEqual([])
})

test("パンくずは、一番上のフォルダからそのフォルダまで。開いているフォルダは、無くなっていれば書庫ホーム", () => {
  const { library, folder } = setup()
  expect(pathTo(library().folders, HOME_ID)).toEqual([HOME_ID])
  expect(pathTo(library().folders, "b2")).toEqual([HOME_ID, folder, "b2"])
  expect(openedFolderOf(library().folders, folder)).toBe(folder)
  expect(openedFolderOf(library().folders, "nothing")).toBe(HOME_ID)
  expect(openedFolderOf(library().folders, undefined)).toBe(HOME_ID)
})

test("行を開くと、フォルダは中へ入り、ブックとその中のページはブックを窓に出す。ゴミ箱の中の物は開かない", () => {
  const { library, folder, perform } = setup()
  const row = (holder: string, id: string) => rowsIn(library(), holder).find(r => r.id === id)!
  expect(openTargetOf(library().folders, row(HOME_ID, folder))).toEqual({ to: "folder", folder })
  expect(openTargetOf(library().folders, row(folder, "b2"))).toEqual({ to: "book", book: "b2" })
  expect(openTargetOf(library().folders, row("b1", "p1"))).toEqual({ to: "book", book: "b1", page: "p1" })
  expect(perform("@matomezu/base:entry-trash", { entry: "b1" }).ok).toBe(true)
  expect(pathTo(library().folders, "b1")).toEqual([TRASH_ID, "b1"])
  expect(openTargetOf(library().folders, row(TRASH_ID, "b1"))).toBe(NOT_OPENED)
  expect(openTargetOf(library().folders, row("b1", "p1"))).toBe(NOT_OPENED)
})

test("ゴミ箱の中のフォルダは開けないので、開いているフォルダはゴミ箱になる", () => {
  const { library, folder, perform } = setup()
  expect(perform("@matomezu/base:entry-trash", { entry: folder }).ok).toBe(true)
  expect(openedFolderOf(library().folders, folder)).toBe(TRASH_ID)
  expect(openedFolderOf(library().folders, TRASH_ID)).toBe(TRASH_ID)
})

test("ゴミ箱の行は、入れた時刻の新しい順に、どの種類の物も並び、戻すと入るフォルダを持つ", () => {
  let now = "2026-11-18T01:00:00.000Z"
  const store = newStore({ now: () => now })
  const perform = store.actions.perform as (id: string, args: unknown) => { ok: boolean; result?: unknown }
  const library = () => store.state.getState()
  const folder = (perform(FOLDER_CREATE.id, { title: "仕事" }).result as { folder: string }).folder
  const inner = (perform(FOLDER_CREATE.id, { title: "下書き", into: folder }).result as { folder: string }).folder
  expect(perform("@matomezu/base:entry-move", { entry: "b2", into: inner }).ok).toBe(true)
  expect(trashRowsOf(library())).toEqual([])
  expect(perform("@matomezu/base:entry-trash", { entry: "b2" }).ok).toBe(true)
  now = "2026-11-18T02:00:00.000Z"
  expect(perform("@matomezu/base:entry-trash", { entry: inner }).ok).toBe(true)
  expect(perform("@matomezu/base:entry-trash", { entry: "b1" }).ok).toBe(true)
  // 同じ時刻なら後から入れた物が先。元いたフォルダ（下書き）がゴミ箱に在る b2 は、その上の今も在るフォルダへ戻る
  expect(trashRowsOf(library()).map(r => [r.kind, r.id, r.trashed, r.into])).toEqual([
    ["book", "b1", "2026-11-18T02:00:00.000Z", HOME_ID],
    ["folder", inner, "2026-11-18T02:00:00.000Z", folder],
    ["book", "b2", "2026-11-18T01:00:00.000Z", folder],
  ])
  expect(trashRowsOf(library())[1]).toMatchObject({ title: "下書き", readable: true, place: "仕事" })
})

test("戻すときに確かめる事: 元いたフォルダが無いか、入る先に同じ名前の物が在るときの番号を付けた名前と、上書きで消える物", () => {
  const { library, folder, perform } = setup()
  const title = rowsIn(library(), folder).find(r => r.id === "b2")!.title
  expect(restorePlanOf(library(), "b2")).toBeUndefined()
  // 書庫ホームから捨てた物は、書庫ホームへ戻る（元いたフォルダは在る）
  expect(perform("@matomezu/base:entry-trash", { entry: "b1" }).ok).toBe(true)
  expect(restorePlanOf(library(), "b1")).toEqual({
    into: HOME_ID,
    from: "here",
    numbered: SAME_TITLE,
    replaces: "",
    overwrite: "ok",
  })
  expect(perform("@matomezu/base:entry-trash", { entry: "b2" }).ok).toBe(true)
  // 元いたフォルダが在り、同じ名前の物も無い
  expect(restorePlanOf(library(), "b2")).toEqual({
    into: folder,
    from: "here",
    numbered: SAME_TITLE,
    replaces: "",
    overwrite: "ok",
  })
  // 同じ名前の物を元いたフォルダに作ると、番号を付けた名前を言う
  const same = (perform(FOLDER_CREATE.id, { title, into: folder }).result as { folder: string }).folder
  expect(restorePlanOf(library(), "b2")).toEqual({
    into: folder,
    from: "here",
    numbered: `${title} 2`,
    replaces: same,
    overwrite: "kind",
  })
  // 元いたフォルダがゴミ箱に入ると、その上のフォルダ（書庫ホーム）へ戻る
  expect(perform("@matomezu/base:entry-trash", { entry: folder }).ok).toBe(true)
  expect(restorePlanOf(library(), "b2")).toEqual({
    into: HOME_ID,
    from: "trashed",
    numbered: SAME_TITLE,
    replaces: "",
    overwrite: "ok",
  })
  // 元いたフォルダが書庫から消えても、同じ所へ戻る
  expect(perform("@matomezu/base:entry-purge", { entries: [folder] }).ok).toBe(true)
  expect(restorePlanOf(library(), "b2")).toEqual({
    into: HOME_ID,
    from: "gone",
    numbered: SAME_TITLE,
    replaces: "",
    overwrite: "ok",
  })
})

test("見せているフォルダは、右の枠で開いているフォルダと、ツリーで中を出しているフォルダ（上のフォルダが閉じていれば入らず、ゴミ箱の中はツリーに出さない）", () => {
  const { library, folder } = setup()
  const folders = library().folders
  // 右の枠で開いているフォルダは、ツリーで閉じていても入る
  expect(shownFoldersOf(folders, folder, [])).toEqual([folder])
  expect(shownFoldersOf(folders, TRASH_ID, [])).toEqual([TRASH_ID])
  // フォルダの中のブック b2 は、上のフォルダ（書庫ホームとそのフォルダ）も全部開いているときだけ
  expect(shownFoldersOf(folders, HOME_ID, [HOME_ID, "b2"])).toEqual([HOME_ID])
  expect(shownFoldersOf(folders, HOME_ID, [folder, "b2"])).toEqual([HOME_ID])
  expect(shownFoldersOf(folders, HOME_ID, [HOME_ID, folder, "b2"]).sort()).toEqual([HOME_ID, folder, "b2"].sort())
  // ゴミ箱と、無いフォルダは、ツリーで開いた印が在っても入らない
  expect(shownFoldersOf(folders, HOME_ID, [HOME_ID, TRASH_ID, "no-such-folder"])).toEqual([HOME_ID])
})

test("ツリーに出ている行は、一番上の行と、中を出しているフォルダの下の行。ゴミ箱とページは中を出せない。今いる行は、選んだページか、開いているフォルダ", () => {
  const { library, folder } = setup()
  const ids = (unfolded: string[]) => treeRowsOf(library().folders, unfolded).map(r => r.id)
  expect(ids([])).toEqual([HOME_ID, TRASH_ID])
  const home = entriesIn(library().folders, HOME_ID).map(r => r.id)
  expect(home.slice(0, 2)).toEqual(["b1", "b3"])
  expect(ids([HOME_ID])).toEqual([HOME_ID, ...home, TRASH_ID])
  // 上のフォルダの中を出していなければ、その下の行は出ない
  expect(ids([folder])).toEqual([HOME_ID, TRASH_ID])
  const rows = treeRowsOf(library().folders, [HOME_ID, folder, "b1", TRASH_ID])
  expect(rows.map(r => r.id)).toEqual([
    HOME_ID,
    "b1",
    ...entriesIn(library().folders, "b1").map(r => r.id),
    ...home.slice(1, -1),
    folder,
    "b2",
    TRASH_ID,
  ])
  expect(rows.find(r => r.id === "b2")).toEqual({ id: "b2", holder: folder, holds: true, unfolded: false })
  expect(rows.find(r => r.id === "p1")).toMatchObject({ holder: "b1", holds: false, unfolded: "not-unfoldable" })
  expect(rows.find(r => r.id === TRASH_ID)).toMatchObject({ holder: TRASH_ID, holds: true, unfolded: "not-unfoldable" })
  expect(treeCurrentOf(library().folders, "b1", "p1")).toBe("p1")
  expect(treeCurrentOf(library().folders, HOME_ID, "b1")).toBe(HOME_ID)
  expect(treeCurrentOf(library().folders, folder, undefined)).toBe(folder)
})
