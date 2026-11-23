// 書庫の画面のコマンド（base/library/commands.ts）: 扱う物の決め方・ツリーと右の枠の矢印・落とした物を動かす

import { expect, test } from "bun:test"
import type { CommandId } from "../../../web/src/core/catalog"
import { entriesIn } from "../../../web/src/core/entries"
import { HOME_ID, TRASH_ID, UNREADABLE_ID } from "../../../web/src/core/folders"
import { NOTHING_OPENED } from "../../../web/src/core/stage"
import { holderForNewPage, pageFolderFor } from "../../../web/src/plugins/base/library/entries"
import {
  LIBRARY_COLUMNS,
  LIBRARY_FOLDER,
  LIBRARY_PICKED,
  LIBRARY_QUERY,
  LIBRARY_UNFOLDED,
} from "../../../web/src/plugins/base/library/state"
import { isEnabled, isShown } from "../../../web/src/store/commands"
import { pluginValueOf } from "../../../web/src/store/plugin-state"
import { newStore, worldRows } from "../../support"

function setup(now: () => string = () => "2026-11-18T01:00:00.000Z") {
  const store = newStore({ now })
  const { state, actions } = store
  const center = state.getState().window.screens.find(s => s.stages === undefined)?.id as string
  actions.makeScreenCurrent(center)
  const perform = actions.perform as (id: string, args: unknown) => { ok: boolean; result?: unknown }
  const folder = (title: string, into: string = HOME_ID) =>
    (perform("@matomezu/base:folder-create", { title, into }).result as { folder: string }).folder
  const run = (id: string, args?: unknown) =>
    (actions.command as (at: string, id: string, ...args: unknown[]) => boolean)(
      center,
      `@matomezu/base:${id}`,
      ...(args === undefined ? [] : [args]),
    )
  const at = () => {
    const values = state.getState().pluginValues
    return {
      folder: pluginValueOf(values, center, LIBRARY_FOLDER),
      picked: pluginValueOf(values, center, LIBRARY_PICKED),
      unfolded: pluginValueOf(values, center, LIBRARY_UNFOLDED),
    }
  }
  const ids = (into: string) => entriesIn(state.getState().folders, into).map(r => r.id)
  const shown = (id: string) => isShown(store, state.getState(), center, `@matomezu/base:${id}` as CommandId)
  return {
    store,
    center,
    folder,
    run,
    at,
    ids,
    shown,
    set: store.setPluginState,
    dialog: () => state.getState().dialog,
  }
}

test("ツリーの矢印: 上下は出ている行を移り、中へ入れる行はその中身を出し、入れない行はそれを持つフォルダの中身を出して選ぶ。左右は中をしまう・出す、上のフォルダへ・中の行へ", () => {
  const { center, folder, run, at, ids, set } = setup()
  // ゴミ箱の行を作っておく（一度もゴミ箱に入れていない書庫には、ゴミ箱の行が無い）
  run("library-entry-move", { entry: folder("捨てる"), to: { to: "trash" } })
  const a = folder("あ")
  const inner = folder("中", a)
  const home = ids(HOME_ID)
  // 最初は書庫ホーム（中を出している）。下へ: 最初の行（ブック b1）
  run("library-tree-move", { to: "down" })
  expect(at()).toMatchObject({ folder: "b1", picked: undefined })
  // 右: 中を出す。もう一度右: 中の行（ページ）へ。ページは、それを持つブックの中身を出して選ぶ
  run("library-tree-unfold-or-next")
  expect(at().unfolded).toEqual([HOME_ID, "b1"])
  run("library-tree-unfold-or-next")
  expect(at()).toMatchObject({ folder: "b1", picked: "p1" })
  // 左: 上のフォルダへ。もう一度左: 中をしまう
  run("library-tree-fold-or-parent")
  expect(at()).toMatchObject({ folder: "b1", picked: undefined })
  run("library-tree-fold-or-parent")
  expect(at().unfolded).toEqual([HOME_ID])
  // 上: 書庫ホーム。その上は無い
  run("library-tree-move", { to: "up" })
  expect(at().folder).toBe(HOME_ID)
  run("library-tree-move", { to: "up" })
  expect(at().folder).toBe(HOME_ID)
  // しまっている行の下の行は飛ばす: あ（しまっている）の下は、ゴミ箱
  set(LIBRARY_FOLDER.id, center, a)
  run("library-tree-move", { to: "down" })
  expect(at().folder).toBe(TRASH_ID)
  // ゴミ箱は中を出せない
  run("library-tree-unfold-or-next")
  expect(at().unfolded).toEqual([HOME_ID])
  run("library-tree-move", { to: "up" })
  expect(at().folder).toBe(a)
  run("library-tree-unfold-or-next")
  run("library-tree-unfold-or-next")
  expect(at().folder).toBe(inner)
  expect(home.at(-1)).toBe(a)
})

test("右の枠の矢印: 選んでいる行の前・次を選ぶ。選んでいなければ最初の行。端では動かない", () => {
  const { run, at, ids } = setup()
  const home = ids(HOME_ID)
  run("library-pick-move", { to: "next" })
  expect(at().picked).toBe(home[0])
  run("library-pick-move", { to: "previous" })
  expect(at().picked).toBe(home[0])
  run("library-pick-move", { to: "next" })
  expect(at().picked).toBe(home[1])
})

test("ゴミ箱の右の枠の矢印は、見せている順（入れた時刻の新しい順）に選ぶ", () => {
  let now = "2026-11-18T01:00:00.000Z"
  const { store, run, at, set, center } = setup(() => now)
  const perform = store.actions.perform as (id: string, args: unknown) => { ok: boolean }
  expect(perform("@matomezu/base:entry-trash", { entry: "b1" }).ok).toBe(true)
  now = "2026-11-18T02:00:00.000Z"
  expect(perform("@matomezu/base:entry-trash", { entry: "b2" }).ok).toBe(true)
  set(LIBRARY_FOLDER.id, center, TRASH_ID)
  run("library-pick-move", { to: "next" })
  expect(at().picked).toBe("b2")
  run("library-pick-move", { to: "next" })
  expect(at().picked).toBe("b1")
})

test("読めない物のフォルダの右の枠の矢印は、見せている順（移った時刻の新しい順、形に合わない物は最後）に選ぶ", () => {
  const { store, run, at, set, center } = setup()
  // 読めない物のフォルダの並び: 移った時刻の違う 2 つと、その間に形に合わない要素 1 つ（ホストが知らせる行の形）
  const ref = (id: string, moved: string) => ({
    entry: { kind: "page", id },
    from: [HOME_ID],
    after: "none",
    code: "W029",
    moved,
  })
  const world = worldRows([])
  store.receive(
    {
      pages: [...world.pages, ...["u1", "u3"].map(id => ({ kind: "page", id, type: "@ex/none:x", title: id }))],
      folders: [
        ...world.folders,
        {
          folderRole: "unreadable",
          id: UNREADABLE_ID,
          lineup: [
            ref("u1", "2026-11-18T01:00:00.000Z"),
            { entry: { id: "u2" } },
            ref("u3", "2026-11-18T02:00:00.000Z"),
          ],
        },
      ],
      settings: {},
    },
    [],
  )
  expect(store.state.getState().unreadableFolder.map(i => i.id)).toEqual(["u1", "u2", "u3"])
  set(LIBRARY_FOLDER.id, center, UNREADABLE_ID)
  const picks = [1, 2, 3].map(() => {
    run("library-pick-move", { to: "next" })
    return at().picked
  })
  expect(picks).toEqual(["u3", "u1", "u2"])
})

test("右の枠の上下の矢印: ビューが測った列の数だけ前・後ろの行を選ぶ。真下に行が無ければ下の段の最後の行。測っていなければ 1 列", () => {
  const { center, run, at, ids, set } = setup()
  const home = ids(HOME_ID)
  // 3 列で 8 行: 0 1 2 / 3 4 5 / 6 7
  expect(home).toHaveLength(8)
  run("library-pick-move", { to: "down" })
  expect(at().picked).toBe(home[0])
  run("library-pick-move", { to: "down" })
  expect(at().picked).toBe(home[1])
  set(LIBRARY_COLUMNS.id, center, 3)
  run("library-pick-move", { to: "down" })
  expect(at().picked).toBe(home[4])
  run("library-pick-move", { to: "down" })
  expect(at().picked).toBe(home[7])
  run("library-pick-move", { to: "down" })
  expect(at().picked).toBe(home[7])
  run("library-pick-move", { to: "up" })
  expect(at().picked).toBe(home[4])
  run("library-pick-move", { to: "next" })
  run("library-pick-move", { to: "down" })
  expect(at().picked).toBe(home[7])
  run("library-pick-move", { to: "up" })
  run("library-pick-move", { to: "up" })
  run("library-pick-move", { to: "up" })
  expect(at().picked).toBe(home[1])
})

test("扱う物: 何も受け取らなければ選んでいる行（無ければ何もしない）。ツリーのキーからは、ツリーで今いる行。名指せば、その物", () => {
  const { center, folder, run, ids, set, dialog } = setup()
  const a = folder("あ")
  const b = folder("い", a)
  // 何も選ばずに: 開いているフォルダ（あ）には効かない
  set(LIBRARY_FOLDER.id, center, a)
  run("library-entry-trash")
  run("library-entry-rename")
  expect(ids(HOME_ID)).toContain(a)
  expect(dialog()).toBeNull()
  // ツリーのキーから: ツリーで今いる行（あ）
  run("library-entry-rename", { at: "tree" })
  expect(dialog()).toMatchObject({ id: "@matomezu/base:library-entry-rename", args: { entry: a } })
  run("dialog-close")
  // 選んでいる行
  set(LIBRARY_PICKED.id, center, b)
  run("library-entry-trash")
  expect(ids(a)).toEqual([])
  // 名指し
  run("library-entry-trash", { entry: a })
  expect(ids(HOME_ID)).not.toContain(a)
  // 書庫ホームには、名前の変更もゴミ箱も効かない。ブックの中のページは、名前を変えられるが、ゴミ箱には入れない
  run("library-entry-trash", { entry: HOME_ID })
  run("library-entry-rename", { entry: HOME_ID })
  expect(dialog()).toBeNull()
  run("library-entry-trash", { entry: "p1" })
  expect(ids("b1")).toEqual(["p1"])
  run("library-entry-rename", { entry: "p1" })
  expect(dialog()).toMatchObject({ id: "@matomezu/base:library-entry-rename", args: { entry: "p1" } })
})

test("右クリックのメニューの行: フォルダは作る・名前の変更・ゴミ箱、ブックは開く・名前の変更・ゴミ箱、ブックの中のページは開く・名前の変更・複製。何も無い所は、作るだけ（ブックの中なら、それを入れているフォルダに作る）", () => {
  const { store, center, folder, run, shown, dialog } = setup()
  const a = folder("あ")
  const [open, book, fold, rename, copy, trash] = [
    "library-entry-open",
    "library-book-new",
    "library-folder-new",
    "library-entry-rename",
    "library-entry-duplicate",
    "library-entry-trash",
  ] as const
  const rows = [open, book, fold, rename, copy, trash]
  const menu = (id: string, target: unknown) => {
    store.actions.openContextMenu(center, `@matomezu/base:${id}`, target, { x: 0, y: 0 })
    return rows.filter(shown)
  }
  expect(menu("library-entry-context", { entry: a })).toEqual([book, fold, rename, trash])
  expect(menu("library-entry-context", { entry: "b1" })).toEqual([open, rename, trash])
  expect(menu("library-entry-context", { entry: "p1" })).toEqual([open, rename, copy])
  expect(menu("library-entry-context", { entry: HOME_ID })).toEqual([book, fold])
  expect(menu("library-folder-context", { folder: a })).toEqual([book, fold])
  expect(menu("library-folder-context", { folder: "b1" })).toEqual([book, fold])
  expect(menu("library-folder-context", { folder: TRASH_ID })).toEqual([])
  // ゴミ箱に入れたブックの中のページには、複製を出さない
  const perform = store.actions.perform as (id: string, args: unknown) => { ok: boolean }
  expect(perform("@matomezu/base:entry-trash", { entry: "b2" }).ok).toBe(true)
  const inTrash = entriesIn(store.state.getState().folders, "b2")[0]?.id as string
  expect(menu("library-entry-context", { entry: inTrash })).not.toContain(copy)
  // ブックの中の何も無い所から作ると、ブックを入れているフォルダ（書庫ホーム）に作る
  menu("library-folder-context", { folder: "b1" })
  run("library-folder-new", { folder: "b1" })
  expect(dialog()).toMatchObject({ args: { into: HOME_ID } })
})

test("落とした物を動かす: フォルダの位置へ・ゴミ箱へ。何も選んでいなくても行う。選んでいた行が、開いているフォルダから出たら、選ぶのを外す", () => {
  const { center, folder, run, at, ids, set } = setup()
  const a = folder("あ")
  const b = folder("い")
  const c = folder("う")
  // 何も選ばずに、ゴミ箱へ
  run("library-entry-move", { entry: c, to: { to: "trash" } })
  expect(ids(HOME_ID)).not.toContain(c)
  // 選んでいる行を、同じフォルダの中で動かしても、選んだまま
  set(LIBRARY_PICKED.id, center, b)
  run("library-entry-move", { entry: b, to: { to: "folder", into: HOME_ID, index: 0 } })
  expect(ids(HOME_ID)[0]).toBe(b)
  expect(at().picked).toBe(b)
  // ほかのフォルダへ動かすと、外れる
  run("library-entry-move", { entry: b, to: { to: "folder", into: a } })
  expect(ids(a)).toEqual([b])
  expect(at().picked).toBeUndefined()
})

test("落とした物を動かす: ブックのページをフォルダへ出し、ブックへ戻す。バインダもブックとフォルダの間を動く", () => {
  const { store, folder, run, ids } = setup()
  const a = folder("あ")
  const page = ids("b1")[0] as string
  run("library-entry-move", { entry: page, to: { to: "folder", into: a } })
  expect(ids(a)).toEqual([page])
  expect(ids("b1")).not.toContain(page)
  run("library-entry-move", { entry: page, to: { to: "folder", into: "b1", index: 0 } })
  expect(ids("b1")[0]).toBe(page)
  const made = store.actions.perform(
    "@matomezu/base:page-add",
    { type: "@matomezu/slide-page:slide", title: "1", into: { newBinder: "説明" } } as never,
    { book: "b1" },
  )
  const binder = (made.ok && (made.result as { binder: string }).binder) as string
  run("library-entry-move", { entry: binder, to: { to: "folder", into: a } })
  expect(ids(a)).toEqual([binder])
  run("library-entry-move", { entry: binder, to: { to: "folder", into: "b1" } })
  expect(ids("b1").at(-1)).toBe(binder)
})

test("落とした物を動かす: スライドをフォルダへ落とすと、そのページだけのバインダが出来る（名前が重なれば番号）。それを書庫ホームへ落とすと、バインダごと動く", () => {
  const { store, folder, run, ids } = setup()
  const a = folder("あ")
  folder("説明 - 1", a)
  const made = store.actions.perform(
    "@matomezu/base:page-add",
    { type: "@matomezu/slide-page:slide", title: "1", into: { newBinder: "説明" } } as never,
    { book: "b1" },
  )
  const { page, binder } = (made.ok && made.result) as { page: string; binder: string }
  run("library-entry-move", { entry: page, to: { to: "folder", into: a } })
  const box = ids(a)[1] as string
  const folders = () => store.state.getState().folders
  expect(folders()[box]).toMatchObject({ folderRole: "binder", title: "説明 - 1 2", lineup: [{ id: page }] })
  expect(ids(binder)).toEqual([])
  run("library-entry-move", { entry: page, to: { to: "folder", into: HOME_ID, index: 0 } })
  expect(ids(HOME_ID)[0]).toBe(box)
  expect(ids(a)).not.toContain(box)
})

test("開く: 2 回押す・Enter・メニューの「開く」の 1 つの道。名指さなければ選んでいる行、{at: tree} ならツリーで今いる行。フォルダは中へ入る", () => {
  const { store, center, folder, run, at, set } = setup()
  const opened = () => store.state.getState().window.screens.flatMap(s => s.stages?.stages.map(st => st.opened) ?? [])
  const shows = (book: string) =>
    opened().some(o => o !== NOTHING_OPENED && "outermost" in o && o.outermost.id === book)
  const a = folder("あ")
  // 何も選んでいなければ、何もしない
  run("library-entry-open")
  expect(at().folder).toBeUndefined()
  // 名指せば、選んでいなくても窓に出す
  run("library-entry-open", { entry: "b3" })
  expect(shows("b3")).toBe(true)
  // 選んでいるフォルダは、中へ入る
  set(LIBRARY_PICKED.id, center, a)
  run("library-entry-open")
  expect(at()).toMatchObject({ folder: a, picked: undefined })
  // ツリーで今いる行（開いているフォルダ あ）: 中へ入ったまま
  run("library-entry-open", { at: "tree" })
  expect(at().folder).toBe(a)
  // ツリーで今いる行がブックなら、窓に出す
  set(LIBRARY_FOLDER.id, center, "b4")
  run("library-entry-open", { at: "tree" })
  expect(shows("b4")).toBe(true)
})

test("書庫を開く: 書庫のスクリーンを 1 枚ずつの並べ方でカレントにする。開いていれば新しく開かず、それをカレントスクリーンにする", () => {
  const { store, center } = setup()
  const screens = () => store.state.getState().window.screens.filter(s => s.def === "@matomezu/base:library-screen")
  const current = () => store.state.getState().window.order.at(-1)
  store.actions.command(center, "@matomezu/base:library-open")
  expect(screens()).toHaveLength(1)
  expect(current()).toBe(screens()[0]?.id)
  store.actions.makeScreenCurrent(center)
  store.actions.command(center, "@matomezu/base:library-open")
  expect(screens()).toHaveLength(1)
  expect(current()).toBe(screens()[0]?.id)
  expect(store.state.getState().window.arrangement).toBe("@matomezu/base:one-screen")
})

test("ツリーで今いる行のゴミ箱入れをロックが止めていれば、Delete を押しても、右の枠で選んでいる別のブックはゴミ箱に入らない。右の枠の Delete は、選んでいる行に効く。ロックしたブックの F2 は何もしない", () => {
  const { store, center, folder, ids, set, dialog } = setup()
  const perform = store.actions.perform as (id: string, args: unknown, on?: unknown) => { ok: boolean }
  const box = folder("箱")
  perform("@matomezu/base:entry-move", { entry: "b1", into: box })
  perform("@matomezu/base:entry-move", { entry: "b2", into: box })
  expect(perform("@matomezu/base:book-lock", {}, { book: "b1" }).ok).toBe(true)
  set(LIBRARY_FOLDER.id, center, box)
  set(LIBRARY_PICKED.id, center, "b2")
  const scope = (id: string) => `@matomezu/base:${id}`
  // ツリーで今いる行は、開いている「箱」（ロックしたブックを入れている）
  expect(store.actions.pressKey("Delete", [scope("library-tree"), scope("library")])).toBe(false)
  expect(ids(box)).toEqual(["b1", "b2"])
  expect(store.actions.pressKey("Delete", [scope("library-contents"), scope("library")])).toBe(true)
  expect(ids(box)).toEqual(["b1"])
  // ロックしたブックを選んで F2 を押しても、名前の変更のダイアログは開かない
  set(LIBRARY_PICKED.id, center, "b1")
  expect(store.actions.pressKey("F2", [scope("library-contents"), scope("library")])).toBe(false)
  expect(dialog()).toBeNull()
})

test("ロックしたページ・ロックしたブックの中のページの「名前の変更」は、押す前に止められて押せず、F2 も何もしない。ロックしていないページは押せる", () => {
  const { store, center, set, dialog } = setup()
  const perform = store.actions.perform as (id: string, args: unknown, on?: unknown) => { ok: boolean }
  const enabled = (entry: string) =>
    isEnabled(store, store.state.getState(), center, "@matomezu/base:library-entry-rename" as CommandId, { entry })
  expect(enabled("p1")).toBe(true)
  expect(perform("@matomezu/base:page-lock", {}, { page: "p1" }).ok).toBe(true)
  expect(perform("@matomezu/base:book-lock", {}, { book: "b2" }).ok).toBe(true)
  expect(enabled("p1")).toBe(false)
  expect(enabled("b2-p1")).toBe(false)
  expect(enabled("b3-p1")).toBe(true)
  // ロックしたページを選んで F2 を押しても、名前の変更のダイアログは開かない
  const scope = (id: string) => `@matomezu/base:${id}`
  set(LIBRARY_FOLDER.id, center, "b1")
  set(LIBRARY_PICKED.id, center, "p1")
  expect(store.actions.pressKey("F2", [scope("library-contents"), scope("library")])).toBe(false)
  expect(dialog()).toBeNull()
})

test("落とした物を動かすコマンドは、行うアクションを引数で名乗る: ロックしたブックをゴミ箱へ落としても、押す前に止められて何もせず、トーストも出さない", () => {
  const { store, center, run, ids } = setup()
  const perform = store.actions.perform as (id: string, args: unknown, on?: unknown) => { ok: boolean }
  expect(perform("@matomezu/base:book-lock", {}, { book: "b1" }).ok).toBe(true)
  const enabled = (args: unknown) =>
    isEnabled(store, store.state.getState(), center, "@matomezu/base:library-entry-move" as CommandId, args)
  // 引数が無ければ分からないので、押せる
  expect(enabled(undefined)).toBe(true)
  expect(enabled({ entry: "b1", to: { to: "trash" } })).toBe(false)
  expect(enabled({ entry: "b2", to: { to: "trash" } })).toBe(true)
  expect(run("library-entry-move", { entry: "b1", to: { to: "trash" } })).toBe(false)
  expect(ids(HOME_ID)).toContain("b1")
  expect(store.state.getState().toasts).toEqual([])
})

test("検索している間に、フォルダを開く・ツリーの矢印でフォルダの行へ移ると、検索をやめる。ブックを開くだけなら、検索はそのまま", () => {
  const { store, center, folder, run, at, set } = setup()
  const query = () => pluginValueOf(store.state.getState().pluginValues, center, LIBRARY_QUERY)
  const a = folder("あ")
  // ブックを開く: 検索はそのまま
  set(LIBRARY_QUERY.id, center, "あ")
  run("library-entry-open", { entry: "b3" })
  expect(query()).toBe("あ")
  // 検索の結果のフォルダを開く: 中へ入り、検索をやめる
  run("library-entry-open", { entry: a })
  expect(at()).toMatchObject({ folder: a, picked: undefined })
  expect(query()).toBeUndefined()
  // ツリーの矢印でフォルダの行へ移る: 検索をやめる
  set(LIBRARY_QUERY.id, center, "あ")
  run("library-tree-fold-or-parent")
  expect(at().folder).toBe(HOME_ID)
  expect(query()).toBeUndefined()
})

test("読めない物のフォルダを開く: 書庫を開き、検索していればやめ、選んでいる行も外して、右の枠に読めない物のフォルダを出す", () => {
  const { store, run, set } = setup()
  run("library-open")
  const library = store.state.getState().window.screens.find(s => s.def === "@matomezu/base:library-screen")
    ?.id as string
  set(LIBRARY_QUERY.id, library, "企画")
  set(LIBRARY_PICKED.id, library, "b1")
  run("library-unreadable-open")
  const values = store.state.getState().pluginValues
  expect(pluginValueOf(values, library, LIBRARY_FOLDER)).toBe(UNREADABLE_ID)
  expect(pluginValueOf(values, library, LIBRARY_PICKED)).toBeUndefined()
  expect(pluginValueOf(values, library, LIBRARY_QUERY)).toBeUndefined()
})

test("「新しいページ…」は、受け取った物（書庫ホーム・フォルダ・ブック・ブックの外のバインダ）を作る先に、タイプの一覧のメニューを押した位置に開く。ページの行には出さない", () => {
  const { store, center, folder, run, shown } = setup()
  const { state, actions } = store
  const perform = actions.perform as (id: string, args: unknown) => { ok: boolean; result?: unknown }
  const made = (args: object) => perform("@matomezu/base:page-create", args).result as { page: string; binder?: string }
  const menu = () => state.getState().contextMenu
  const a = folder("あ")
  const page = made({ folder: a, type: "@matomezu/drawing:drawing", title: "図" }).page
  const binder = made({ folder: a, type: "@matomezu/slide-page:slide", title: "1", into: { newBinder: "発表" } })
    .binder as string
  const book = (perform("@matomezu/base:book-create", { title: "本", into: a }).result as { book: string }).book
  const open = (target: object) => {
    actions.openContextMenu(center, "@matomezu/base:library-entry-context", target, { x: 1, y: 2 })
    const was = shown("library-page-new")
    actions.closeContextMenu()
    return was
  }
  // ページの行には出さない
  expect(open({ entry: page })).toBe(false)
  for (const entry of [a, binder, book]) {
    const pressed = { x: 30, y: 40 }
    expect(open({ entry, pressed })).toBe(true)
    expect(run("library-page-new", { entry, pressed })).toBe(true)
    expect(menu()).toMatchObject({ id: "@matomezu/base:library-add-page-menu", target: { folder: entry }, at: pressed })
    actions.closeContextMenu()
  }
  // 何も無い所のメニューは、開いているフォルダが先（選んでいる行がページでも）
  store.setPluginState(LIBRARY_PICKED.id, center, page)
  expect(run("library-page-new", { folder: HOME_ID, pressed: { x: 5, y: 6 } })).toBe(true)
  expect(menu()).toMatchObject({ target: { folder: HOME_ID }, at: { x: 5, y: 6 } })
  actions.closeContextMenu()
  expect(run("library-folder-new", { folder: HOME_ID })).toBe(true)
  expect(state.getState().dialog).toMatchObject({ args: { into: HOME_ID } })
})

test("ページを作る先: ブックの中のバインダはブックへ、ゴミ箱の中は無し。ブックの外のバインダにタイプの違うページを作るときは、バインダを入れているフォルダへ", () => {
  const { store, folder, run } = setup()
  const { state, actions } = store
  const perform = actions.perform as (id: string, args: unknown) => { ok: boolean; result?: unknown }
  const a = folder("あ")
  const slide = "@matomezu/slide-page:slide"
  const outside = (
    perform("@matomezu/base:page-create", { folder: a, type: slide, title: "1", into: { newBinder: "発表" } })
      .result as { binder: string }
  ).binder
  const book = (perform("@matomezu/base:book-create", { title: "本", into: a }).result as { book: string }).book
  const inBook = (
    perform("@matomezu/base:page-create", { folder: book, type: slide, title: "1", into: { newBinder: "中" } })
      .result as { binder: string }
  ).binder
  const folders = () => state.getState().folders
  expect(holderForNewPage(folders(), HOME_ID)).toBe(HOME_ID)
  expect(holderForNewPage(folders(), a)).toBe(a)
  expect(holderForNewPage(folders(), book)).toBe(book)
  expect(holderForNewPage(folders(), outside)).toBe(outside)
  expect(holderForNewPage(folders(), inBook)).toBe(book)
  expect(pageFolderFor(folders(), outside, slide)).toBe(outside)
  expect(pageFolderFor(folders(), outside, "@matomezu/drawing:drawing")).toBe(a)
  expect(pageFolderFor(folders(), a, slide)).toBe(a)
  run("library-entry-move", { entry: a, to: { to: "trash" } })
  expect(holderForNewPage(folders(), TRASH_ID)).toBeUndefined()
  expect(holderForNewPage(folders(), a)).toBeUndefined()
  expect(holderForNewPage(folders(), book)).toBeUndefined()
  expect(holderForNewPage(folders(), outside)).toBeUndefined()
})
