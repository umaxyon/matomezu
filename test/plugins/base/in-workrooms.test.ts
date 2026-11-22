// ワークルームのフォルダ（システムフォルダ）には、何も入れない・作らない: 認可ステップ in-workrooms が、置き場所の問い（行う前）と確かめ（行った後）で止める。
// 置き場所の確かめを出すのは core（perform-library.ts の placeChecksBetween）
import { expect, test } from "bun:test"
import { USER } from "../../../web/src/core/actor"
import type { ActionContext } from "../../../web/src/core/def/action"
import type { PlaceFolder } from "../../../web/src/core/def/permission"
import { withSystemFolders } from "../../../web/src/core/entries"
import { type Folder, HOME_ID, type Library, TRASH_ID } from "../../../web/src/core/folders"
import { placeChecksBetween } from "../../../web/src/core/perform-library"
import { type PerformedIn, performIn, type World } from "../../../web/src/core/perform-world"
import { BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { IN_WORKROOMS, WORKROOMS } from "../../../web/src/plugins/base/library/system-folders"
import { worldOf } from "../../../web/src/store/world"
import { CORE_CATALOG, newStore, sequence } from "../../support"

const NOW = "2026-11-23T01:00:00.000Z"
const DRAWING = "@matomezu/drawing:drawing"

const ctxOf = (): Omit<ActionContext, "naming"> => ({
  catalog: CORE_CATALOG,
  controlCenter: BUILTIN_CONTROL_CENTER,
  lang: "en",
  newId: sequence("n"),
  now: NOW,
  today: "2026-11-23",
  actor: USER,
})
const run = (world: World, id: string, args: unknown = {}): PerformedIn =>
  performIn(world, `@matomezu/base:${id}`, args, undefined, ctxOf())

// 書庫ホームにドキュメント（sf1）・ワークルーム（sf2）と、空のフォルダ f を足した世界
function prepared(): World {
  const { state } = newStore({ now: () => NOW })
  const start = worldOf(state.getState())
  const filled = withSystemFolders(start, CORE_CATALOG, sequence("sf"))
  if (!filled) throw new Error("no home")
  const home = filled.next.folders[HOME_ID]
  if (home?.folderRole !== "home") throw new Error("no home")
  const f: Folder = { folderRole: "folder", id: "f", title: "f", lineup: [] }
  return {
    ...start,
    ...filled.next,
    folders: {
      ...filled.next.folders,
      f,
      [HOME_ID]: { ...home, lineup: [...home.lineup, { kind: "folder", id: "f" }] },
    },
  }
}

test("ワークルームのフォルダには、フォルダ・ブック・ページを作れず、物を動かし入れられない（in-workrooms が止める）。ほかの所はこれまでどおり", () => {
  const world = prepared()
  expect(world.folders.sf2).toMatchObject({ systemFolder: WORKROOMS.id })
  const rows: [string, string, unknown, boolean][] = [
    ["フォルダを作る", "folder-create", { title: "a", into: "sf2" }, false],
    ["ブックを作る", "book-create", { title: "a", into: "sf2" }, false],
    ["ページを作る", "page-create", { folder: "sf2", type: DRAWING }, false],
    ["空のフォルダを動かし入れる", "entry-move", { entry: "f", into: "sf2" }, false],
    ["ブックを動かし入れる", "entry-move", { entry: "b1", into: "sf2" }, false],
    ["フォルダ f の中にフォルダを作る", "folder-create", { title: "a", into: "f" }, true],
    ["ブックをフォルダ f へ動かす", "entry-move", { entry: "b1", into: "f" }, true],
  ]
  for (const [what, id, args, ok] of rows) {
    const done = run(world, id, args)
    expect([what, done.ok, done.ok ? null : (done as { permission?: string }).permission]).toEqual([
      what,
      ok,
      ok ? null : IN_WORKROOMS.id,
    ])
  }
})

test("行った後の確かめ: 直の入れ物の列のどれかがワークルームなら止め、出すのは止めない", () => {
  const rooms = { folderRole: "folder", id: "r", systemFolder: WORKROOMS.id, lineup: [] } as PlaceFolder
  const home = { folderRole: "home", id: HOME_ID, lineup: [] } as PlaceFolder
  const plain = { folderRole: "folder", id: "f", title: "f", lineup: [] } as PlaceFolder
  const check = (before: readonly PlaceFolder[] | "none", after: readonly PlaceFolder[] | "none") =>
    IN_WORKROOMS.keeps?.({
      kind: "place",
      action: CORE_CATALOG.actions.get("@matomezu/base:entry-move")!,
      entry: { kind: "folder", id: "x" },
      before,
      after,
      actor: USER,
    })
  expect(check([home], [rooms, home])).toBe(false)
  expect(check([home], [plain, rooms, home])).toBe(false)
  expect(check([rooms, home], [home])).toBe(true)
  expect(check("none", [plain, home])).toBe(true)
})

test("置き場所の確かめは、直の入れ物が変わった物だけを出す（同じフォルダの中の並べ替え・フォルダごと動かした中身は出さない）。ゴミ箱の中は none", () => {
  const f = (id: string, lineup: Library["folders"][string]["lineup"] = []): Folder =>
    ({ folderRole: "folder", id, title: id, lineup }) as Folder
  const homeWith = (...ids: string[]): Folder =>
    ({ folderRole: "home", id: HOME_ID, lineup: ids.map(id => ({ kind: "folder", id })) }) as Folder
  const trash = (lineup: unknown[] = []): Folder => ({ folderRole: "trash", id: TRASH_ID, lineup }) as Folder
  const lib = (...rows: Folder[]): Library => ({ pages: {}, folders: Object.fromEntries(rows.map(r => [r.id, r])) })
  const was = lib(homeWith("a", "b"), f("a", [{ kind: "folder", id: "c" }]), f("b"), f("c"), trash())
  // a を b の中へ動かす（中の c は直の入れ物が変わらない）、b と a の並びを入れ替える
  const moved = lib(
    homeWith("b"),
    f("a", [{ kind: "folder", id: "c" }]),
    f("b", [{ kind: "folder", id: "a" }]),
    f("c"),
    trash(),
  )
  expect(placeChecksBetween(was, moved).map(c => [c.entry.id, ids(c.before), ids(c.after)])).toEqual([
    ["a", [HOME_ID], ["b", HOME_ID]],
  ])
  const reordered = lib(homeWith("b", "a"), f("a", [{ kind: "folder", id: "c" }]), f("b"), f("c"), trash())
  expect(placeChecksBetween(was, reordered)).toEqual([])
  // b をゴミ箱へ入れる（後は none）、作ったフォルダ d（前は none）
  const trashed = lib(
    homeWith("a", "d"),
    f("a", [{ kind: "folder", id: "c" }]),
    f("b"),
    f("c"),
    f("d"),
    trash([{ kind: "folder", id: "b", trashed: NOW, from: [HOME_ID] }]),
  )
  expect(placeChecksBetween(was, trashed).map(c => [c.entry.id, ids(c.before), ids(c.after)])).toEqual([
    ["b", [HOME_ID], "none"],
    ["d", "none", [HOME_ID]],
  ])
})

const ids = (over: readonly PlaceFolder[] | "none") => (over === "none" ? "none" : over.map(f => f.id))
