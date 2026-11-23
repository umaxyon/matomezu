// 書庫の画面が描く物（base/library/outline.ts）: フォルダの直下の行・パンくず・行を開いたときの行き先

import { expect, test } from "bun:test"
import { entriesIn } from "../../../web/src/core/entries"
import { BROKEN, FIRST, HOME_ID, TRASH_ID, UNREADABLE_ID } from "../../../web/src/core/folders"
import type { UnreadableItem } from "../../../web/src/core/folders-unreadable"
import { restorePlanOf, SAME_TITLE } from "../../../web/src/plugins/base/library/entries"
import { FOLDER_CREATE } from "../../../web/src/plugins/base/library/entry-move"
import {
  movedPlacesOf,
  NO_TYPE,
  NOT_OPENED,
  NOT_UNFOLDABLE,
  openedFolderOf,
  openTargetOf,
  outsidePagePlaceOf,
  pathTo,
  placeIdOf,
  rowsIn,
  shownFoldersOf,
  tabStopOf,
  trashRowsOf,
  treeCurrentOf,
  treeRowsOf,
  unreadableRowsOf,
} from "../../../web/src/plugins/base/library/outline"
import { foundRowsOf } from "../../../web/src/plugins/base/library/search"
import { NO_DESKS } from "../../../web/src/plugins/base/library/workdesk-rows"
import { DRAWING, drawingPage, testBinder } from "../../lineup"
import { libraryWith, NAMING, newStore, worldRows } from "../../support"

const NOW = "2026-11-18T01:00:00.000Z"

function setup() {
  const store = newStore({ now: () => NOW })
  const perform = store.actions.perform as (id: string, args: unknown) => { ok: boolean; result?: unknown }
  const made = perform(FOLDER_CREATE.id, { title: "仕事", into: HOME_ID })
  const folder = (made.result as { folder: string }).folder
  expect(perform("@matomezu/base:entry-move", { entry: "b2", into: folder }).ok).toBe(true)
  return { store, perform, folder, library: () => store.state.getState() }
}

test("フォルダの直下の行は、並びの順に、種類・名前・ページのタイプを持つ。無いフォルダは空", () => {
  const { library, folder } = setup()
  const home = rowsIn(library(), HOME_ID, NAMING, NO_DESKS)
  expect(home.map(r => r.kind)).toContain("folder")
  expect(home.find(r => r.id === folder)).toEqual({
    kind: "folder",
    id: folder,
    title: "仕事",
    type: NO_TYPE,
    readable: true,
    locked: false,
  })
  expect(home.some(r => r.id === "b2")).toBe(false)
  expect(rowsIn(library(), folder, NAMING, NO_DESKS).map(r => [r.kind, r.id])).toEqual([["book", "b2"]])
  const pages = rowsIn(library(), "b1", NAMING, NO_DESKS)
  expect(pages[0]).toMatchObject({ kind: "page", id: "p1", readable: true })
  expect(pages[0]?.type).not.toBe(NO_TYPE)
  expect(rowsIn(library(), "nothing", NAMING, NO_DESKS)).toEqual([])
})

test("パンくずは、一番上のフォルダからそのフォルダまで。開いているフォルダは、無くなっていれば書庫ホーム", () => {
  const { library, folder } = setup()
  expect(pathTo(library().folders, HOME_ID, NO_DESKS)).toEqual([HOME_ID])
  expect(pathTo(library().folders, "b2", NO_DESKS)).toEqual([HOME_ID, folder, "b2"])
  expect(openedFolderOf(library().folders, folder, NO_DESKS)).toBe(folder)
  expect(openedFolderOf(library().folders, "nothing", NO_DESKS)).toBe(HOME_ID)
})

test("行を開くと、フォルダは中へ入り、ブックとその中のページはブックを窓に出す。ゴミ箱の中の物は開かない", () => {
  const { library, folder, perform } = setup()
  const row = (holder: string, id: string) => rowsIn(library(), holder, NAMING, NO_DESKS).find(r => r.id === id)!
  expect(openTargetOf(library().folders, row(HOME_ID, folder), NO_DESKS)).toEqual({ to: "folder", folder })
  expect(openTargetOf(library().folders, row(folder, "b2"), NO_DESKS)).toEqual({ to: "book", book: "b2" })
  expect(openTargetOf(library().folders, row("b1", "p1"), NO_DESKS)).toEqual({ to: "book", book: "b1", page: "p1" })
  expect(perform("@matomezu/base:entry-trash", { entry: "b1" }).ok).toBe(true)
  expect(pathTo(library().folders, "b1", NO_DESKS)).toEqual([TRASH_ID, "b1"])
  expect(openTargetOf(library().folders, row(TRASH_ID, "b1"), NO_DESKS)).toBe(NOT_OPENED)
  expect(openTargetOf(library().folders, row("b1", "p1"), NO_DESKS)).toBe(NOT_OPENED)
})

test("ブックの外のページの行を開くと、そのページを窓に出す。ブックの外のバインダの行はそのバインダを、その中のページの行はそのバインダをそのページで出す。ゴミ箱に入れたブックの外のページは開かない", () => {
  const binder = testBinder("n1", "束", DRAWING, drawingPage("n1p"))
  const { folders } = libraryWith([], [drawingPage("o1"), binder])
  const target = (id: string, kind: "page" | "binder") => openTargetOf(folders, { id, kind, readable: true }, NO_DESKS)
  expect(target("o1", "page")).toEqual({ to: "page", page: "o1" })
  expect(target("n1", "binder")).toEqual({ to: "binder", binder: "n1" })
  expect(target("n1p", "page")).toEqual({ to: "binder", binder: "n1", page: "n1p" })
  expect(outsidePagePlaceOf(folders, "n1p")).toEqual([HOME_ID])
  const store = newStore()
  store.receive({ ...worldRows([], [drawingPage("o1")]), settings: {} }, [])
  expect(store.actions.perform("@matomezu/base:entry-trash", { entry: "o1" }).ok).toBe(true)
  expect(openTargetOf(store.state.getState().folders, { id: "o1", kind: "page", readable: true }, NO_DESKS)).toBe(
    NOT_OPENED,
  )
})

test("ゴミ箱の中のフォルダは開けないので、開いているフォルダはゴミ箱になる", () => {
  const { library, folder, perform } = setup()
  expect(perform("@matomezu/base:entry-trash", { entry: folder }).ok).toBe(true)
  expect(openedFolderOf(library().folders, folder, NO_DESKS)).toBe(TRASH_ID)
  expect(openedFolderOf(library().folders, TRASH_ID, NO_DESKS)).toBe(TRASH_ID)
})

test("ゴミ箱の行は、入れた時刻の新しい順に、どの種類の物も並び、戻すと入るフォルダを持つ", () => {
  let now = "2026-11-18T01:00:00.000Z"
  const store = newStore({ now: () => now })
  const perform = store.actions.perform as (id: string, args: unknown) => { ok: boolean; result?: unknown }
  const library = () => store.state.getState()
  const folder = (perform(FOLDER_CREATE.id, { title: "仕事", into: HOME_ID }).result as { folder: string }).folder
  const inner = (perform(FOLDER_CREATE.id, { title: "下書き", into: folder }).result as { folder: string }).folder
  expect(perform("@matomezu/base:entry-move", { entry: "b2", into: inner }).ok).toBe(true)
  expect(trashRowsOf(library(), NAMING)).toEqual([])
  expect(perform("@matomezu/base:entry-trash", { entry: "b2" }).ok).toBe(true)
  now = "2026-11-18T02:00:00.000Z"
  expect(perform("@matomezu/base:entry-trash", { entry: inner }).ok).toBe(true)
  expect(perform("@matomezu/base:entry-trash", { entry: "b1" }).ok).toBe(true)
  // 後から入れた物が先（時計が同じ時点を返し続けると、窓が決める時点は読むたびに 1ms 進む）。
  // 元いたフォルダ（下書き）がゴミ箱に在る b2 は、その上の今も在るフォルダへ戻る
  expect(trashRowsOf(library(), NAMING).map(r => [r.kind, r.id, r.trashed, r.into])).toEqual([
    ["book", "b1", "2026-11-18T02:00:00.001Z", HOME_ID],
    ["folder", inner, "2026-11-18T02:00:00.000Z", folder],
    ["book", "b2", "2026-11-18T01:00:00.003Z", folder],
  ])
  expect(trashRowsOf(library(), NAMING)[1]).toMatchObject({ title: "下書き", readable: true, place: "仕事" })
})

test("戻すときに確かめる事: 元いたフォルダが無いか、入る先に同じ名前の物が在るときの番号を付けた名前と、上書きで消える物", () => {
  const { library, folder, perform } = setup()
  const title = rowsIn(library(), folder, NAMING, NO_DESKS).find(r => r.id === "b2")!.title
  expect(restorePlanOf(library(), "b2", NAMING)).toBeUndefined()
  // 書庫ホームから捨てた物は、書庫ホームへ戻る（元いたフォルダは在る）
  expect(perform("@matomezu/base:entry-trash", { entry: "b1" }).ok).toBe(true)
  expect(restorePlanOf(library(), "b1", NAMING)).toEqual({
    into: HOME_ID,
    from: "here",
    numbered: SAME_TITLE,
    replaces: "",
    overwrite: "ok",
  })
  expect(perform("@matomezu/base:entry-trash", { entry: "b2" }).ok).toBe(true)
  // 元いたフォルダが在り、同じ名前の物も無い
  expect(restorePlanOf(library(), "b2", NAMING)).toEqual({
    into: folder,
    from: "here",
    numbered: SAME_TITLE,
    replaces: "",
    overwrite: "ok",
  })
  // 同じ名前の物を元いたフォルダに作ると、番号を付けた名前を言う
  const same = (perform(FOLDER_CREATE.id, { title, into: folder }).result as { folder: string }).folder
  expect(restorePlanOf(library(), "b2", NAMING)).toEqual({
    into: folder,
    from: "here",
    numbered: `${title} 2`,
    replaces: same,
    overwrite: "kind",
  })
  // 元いたフォルダがゴミ箱に入ると、その上のフォルダ（書庫ホーム）へ戻る
  expect(perform("@matomezu/base:entry-trash", { entry: folder }).ok).toBe(true)
  expect(restorePlanOf(library(), "b2", NAMING)).toEqual({
    into: HOME_ID,
    from: "trashed",
    numbered: SAME_TITLE,
    replaces: "",
    overwrite: "ok",
  })
  // 元いたフォルダが書庫から消えても、同じ所へ戻る
  expect(perform("@matomezu/base:entry-purge", { entries: [folder] }).ok).toBe(true)
  expect(restorePlanOf(library(), "b2", NAMING)).toEqual({
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
  expect(shownFoldersOf(folders, folder, [], NO_DESKS)).toEqual([folder])
  expect(shownFoldersOf(folders, TRASH_ID, [], NO_DESKS)).toEqual([TRASH_ID])
  // フォルダの中のブック b2 は、上のフォルダ（書庫ホームとそのフォルダ）も全部開いているときだけ
  expect(shownFoldersOf(folders, HOME_ID, [HOME_ID, "b2"], NO_DESKS)).toEqual([HOME_ID])
  expect(shownFoldersOf(folders, HOME_ID, [folder, "b2"], NO_DESKS)).toEqual([HOME_ID])
  expect(shownFoldersOf(folders, HOME_ID, [HOME_ID, folder, "b2"], NO_DESKS).sort()).toEqual(
    [HOME_ID, folder, "b2"].sort(),
  )
  // ゴミ箱と、無いフォルダは、ツリーで開いた印が在っても入らない
  expect(shownFoldersOf(folders, HOME_ID, [HOME_ID, TRASH_ID, "no-such-folder"], NO_DESKS)).toEqual([HOME_ID])
})

test("ツリーに出ている行は、一番上の行と、中を出しているフォルダの下の行。ゴミ箱とページは中を出せない。今いる行は、選んだページか、開いているフォルダ", () => {
  const { library, folder } = setup()
  const ids = (unfolded: string[]) => treeRowsOf(library().folders, unfolded, false, NO_DESKS).map(r => r.id)
  expect(ids([])).toEqual([HOME_ID, TRASH_ID])
  const home = entriesIn(library().folders, HOME_ID).map(r => r.id)
  expect(home.slice(0, 2)).toEqual(["b1", "b3"])
  expect(ids([HOME_ID])).toEqual([HOME_ID, ...home, TRASH_ID])
  // 上のフォルダの中を出していなければ、その下の行は出ない
  expect(ids([folder])).toEqual([HOME_ID, TRASH_ID])
  const rows = treeRowsOf(library().folders, [HOME_ID, folder, "b1", TRASH_ID], false, NO_DESKS)
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
  expect(treeCurrentOf(library().folders, "b1", "p1", NO_DESKS)).toBe("p1")
  expect(treeCurrentOf(library().folders, HOME_ID, "b1", NO_DESKS)).toBe(HOME_ID)
  expect(treeCurrentOf(library().folders, folder, undefined, NO_DESKS)).toBe(folder)
})

test("検索は、名前に言葉を含む物を書庫ホームから下へ並びの順に出す（大文字と小文字は分けない。前後の空白は除く）。置き場所は上のフォルダの名前の列。ゴミ箱の物は出ない", () => {
  const { library, folder, perform } = setup()
  expect(foundRowsOf(library(), undefined, NAMING)).toEqual([])
  expect(foundRowsOf(library(), "  ", NAMING)).toEqual([])
  const b2 = library().books.b2?.title as string
  const found = foundRowsOf(library(), ` ${b2.toUpperCase()} `, NAMING)
  expect(found.find(r => r.id === "b2")).toMatchObject({ kind: "book", holder: folder, place: ["仕事"] })
  // フォルダも、ブックの中のページも出る
  expect(foundRowsOf(library(), "仕事", NAMING).map(r => r.id)).toEqual([folder])
  const p1 = rowsIn(library(), "b1", NAMING, NO_DESKS).find(r => r.id === "p1")?.title as string
  expect(foundRowsOf(library(), p1, NAMING).find(r => r.id === "p1")).toMatchObject({
    kind: "page",
    holder: "b1",
    place: [library().books.b1?.title],
  })
  expect(perform("@matomezu/base:entry-trash", { entry: folder }).ok).toBe(true)
  expect(foundRowsOf(library(), "仕事", NAMING)).toEqual([])
  expect(foundRowsOf(library(), b2, NAMING).some(r => r.id === "b2")).toBe(false)
})

test("Tab で止まる行: 止めたい行が並びに在ればそれ、無ければ言った行か最初の行。並びが空なら無い", () => {
  expect(tabStopOf(["a", "b"], "b")).toBe("b")
  expect(tabStopOf(["a", "b"], "z")).toBe("a")
  expect(tabStopOf(["a", "b"], undefined)).toBe("a")
  expect(tabStopOf(["a", "b"], "z", HOME_ID)).toBe(HOME_ID)
  expect(tabStopOf([], "z")).toBeUndefined()
})

test("ロック中のページとブックの行は locked を持つ（鍵をアイコンに重ねる）", () => {
  const { store, library } = setup()
  // ページを先に（ロック中のブックのページはロックできない）
  expect(store.actions.perform("@matomezu/base:page-lock", {}, { page: "p1" }).ok).toBe(true)
  expect(store.actions.perform("@matomezu/base:book-lock", {}, { book: "b1" }).ok).toBe(true)
  const home = rowsIn(library(), HOME_ID, NAMING, NO_DESKS)
  expect(home.find(r => r.id === "b1")?.locked).toBe(true)
  expect(home.find(r => r.id === "b3")?.locked).toBe(false)
  const pages = rowsIn(library(), "b1", NAMING, NO_DESKS)
  expect(pages.find(r => r.id === "p1")?.locked).toBe(true)
})

test("読めない物の行は、移った時刻の新しい順に、名前・在った所・訳・移った時刻を持つ。在った所は、書庫に無ければ一緒に移ったブックの名前、ゴミ箱に居た物はゴミ箱に入れる前の所。形に合わない物は名前だけで最後", () => {
  const { library, folder } = setup()
  const T1 = "2026-11-18T01:00:00.000Z"
  const T2 = "2026-11-18T02:00:00.000Z"
  const page = (id: string, title: string) => ({ kind: "page", id, title })
  const items: UnreadableItem[] = [
    {
      id: "p1",
      row: page("p1", "押印の表"),
      ref: {
        entry: { kind: "page", id: "p1" },
        from: ["b1", HOME_ID],
        after: FIRST,
        code: "W027",
        type: "ex2:flow",
        moved: T1,
      },
    },
    {
      id: "mb",
      row: { folderRole: "book", id: "mb", title: "企画書", lineup: [] },
      ref: { entry: { kind: "book", id: "mb" }, from: [HOME_ID], after: FIRST, code: "W005", moved: T1 },
    },
    {
      id: "p2",
      row: page("p2", "押印 2"),
      ref: {
        entry: { kind: "page", id: "p2" },
        from: ["mb", HOME_ID],
        after: FIRST,
        code: "W027",
        type: "ex2:flow",
        moved: T2,
      },
    },
    {
      id: "p3",
      row: page("p3", "メモ"),
      ref: {
        entry: { kind: "page", id: "p3", trashed: T1, from: [folder, HOME_ID] },
        from: [TRASH_ID],
        after: FIRST,
        code: "W029",
        moved: T1,
      },
    },
    { id: "p4", row: page("p4", "壊れた"), ref: BROKEN },
  ]
  const rows = unreadableRowsOf(items, library(), NAMING)
  expect(rows.map(r => r.id)).toEqual(["p2", "p3", "mb", "p1", "p4"])
  expect(rows[0]).toEqual({
    shape: "fits",
    id: "p2",
    title: "押印 2",
    kind: "page",
    place: { id: "mb", title: "企画書", book: true, trash: false },
    code: "W027",
    type: "ex2:flow",
    moved: T2,
  })
  expect(rows[1]).toMatchObject({
    place: { id: folder, title: "仕事", book: false, trash: true },
    code: "W029",
    type: NO_TYPE,
  })
  expect(rows[2]).toMatchObject({ kind: "book", title: "企画書", place: { id: HOME_ID, book: false, trash: false } })
  expect(rows[3]).toMatchObject({ place: { id: "b1", book: true, trash: false } })
  expect(rows[4]).toEqual({ shape: BROKEN, id: "p4", title: "壊れた" })
  expect(unreadableRowsOf([], library(), NAMING)).toBe(unreadableRowsOf([], library(), NAMING))
})

test("読めない物が在った所は、並びに持つフォルダ。ブックの中のバインダならそのブック。列が空なら書庫ホーム", () => {
  const roles: Record<string, string> = { bk: "book", bd: "binder", fd: "folder" }
  const roleOf = (id: string) => roles[id]
  expect(placeIdOf(["bd", "bk", HOME_ID], roleOf)).toBe("bk")
  expect(placeIdOf(["bd", "fd", HOME_ID], roleOf)).toBe("bd")
  expect(placeIdOf(["fd", HOME_ID], roleOf)).toBe("fd")
  expect(placeIdOf([], roleOf)).toBe(HOME_ID)
})

test("無効にしたら移る物は、在る所ごとに数え、在る所が最初に出た順に並ぶ", () => {
  const { library } = setup()
  const places = movedPlacesOf(
    [
      { id: "b2-p1", kind: "page", holder: "b2", code: "W027", type: "ex2:flow" },
      { id: "p1", kind: "page", holder: "b1", code: "W027", type: "ex2:flow" },
      { id: "b2-p2", kind: "page", holder: "b2", code: "W027", type: "ex2:flow" },
    ],
    library(),
    NAMING,
  )
  expect(places).toEqual([
    { id: "b2", title: "画面の構成", book: true, count: 2, pages: true },
    { id: "b1", title: "まとめ図の構想", book: true, count: 1, pages: true },
  ])
})

test("読めない物のフォルダは、設定がオンならツリーの一番上の行の最後に出て、中は出せない。書庫の表に無くても開ける", () => {
  const { library } = setup()
  const folders = library().folders
  expect(treeRowsOf(folders, [], true, NO_DESKS).map(r => r.id)).toEqual([HOME_ID, TRASH_ID, UNREADABLE_ID])
  expect(treeRowsOf(folders, [UNREADABLE_ID], true, NO_DESKS).at(-1)).toEqual({
    id: UNREADABLE_ID,
    holder: UNREADABLE_ID,
    holds: true,
    unfolded: NOT_UNFOLDABLE,
  })
  expect(treeRowsOf(folders, [], false, NO_DESKS).map(r => r.id)).toEqual([HOME_ID, TRASH_ID])
  expect(openedFolderOf(folders, UNREADABLE_ID, NO_DESKS)).toBe(UNREADABLE_ID)
})
