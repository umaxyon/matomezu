// 書庫の画面のコマンド（base/library/commands.ts）: 扱う物の決め方・ツリーと右の枠の矢印・落とした物を動かす
import { expect, test } from "bun:test"
import type { CommandId } from "../../../web/src/core/catalog"
import { entriesIn } from "../../../web/src/core/entries"
import { HOME_ID, TRASH_ID } from "../../../web/src/core/folders"
import {
  LIBRARY_COLUMNS,
  LIBRARY_FOLDER,
  LIBRARY_PICKED,
  LIBRARY_UNFOLDED,
} from "../../../web/src/plugins/base/library/state"
import { isShown } from "../../../web/src/store/commands"
import { pluginValueOf } from "../../../web/src/store/plugin-state"
import { newStore } from "../../support"

function setup() {
  const store = newStore()
  const { state, actions } = store
  const center = state.getState().window.screens.find(s => s.stages === undefined)?.id as string
  actions.makeScreenCurrent(center)
  const perform = actions.perform as (id: string, args: unknown) => { ok: boolean; result?: unknown }
  const folder = (title: string, into?: string) =>
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
  // 書庫ホーム・ブックの中のページには、名前の変更もゴミ箱も効かない
  run("library-entry-trash", { entry: HOME_ID })
  run("library-entry-rename", { entry: "p1" })
  expect(dialog()).toBeNull()
})

test("右クリックのメニューの行: フォルダは作る・名前の変更・ゴミ箱、ブックは開く・名前の変更・ゴミ箱、ブックの中のページは開くだけ（読めなければ出ない）。何も無い所は、作るだけ（ブックの中なら、それを入れているフォルダに作る）", () => {
  const { store, center, folder, run, shown, dialog } = setup()
  const a = folder("あ")
  const [open, book, fold, rename, trash] = [
    "library-entry-open",
    "library-book-new",
    "library-folder-new",
    "library-entry-rename",
    "library-entry-trash",
  ] as const
  const rows = [open, book, fold, rename, trash]
  const menu = (id: string, target: unknown) => {
    store.actions.openContextMenu(center, `@matomezu/base:${id}`, target, { x: 0, y: 0 })
    return rows.filter(shown)
  }
  expect(menu("library-entry-context", { entry: a, readable: true })).toEqual([book, fold, rename, trash])
  expect(menu("library-entry-context", { entry: "b1", readable: true })).toEqual([open, rename, trash])
  expect(menu("library-entry-context", { entry: "p1", readable: true })).toEqual([open])
  expect(menu("library-entry-context", { entry: "p1", readable: false })).toEqual([])
  expect(menu("library-entry-context", { entry: HOME_ID, readable: true })).toEqual([book, fold])
  expect(menu("library-folder-context", { folder: a })).toEqual([book, fold])
  expect(menu("library-folder-context", { folder: "b1" })).toEqual([book, fold])
  expect(menu("library-folder-context", { folder: TRASH_ID })).toEqual([])
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
