// システムフォルダ: system-folder-add が足りない行を書庫ホームの先頭に足し、名前の当たる物に番号を付ける。
// システムフォルダの決まり（印を変えない・定義が在る間はゴミ箱に入れない・先頭に固定・名前は設定の言語で引く）は、perform を通して確かめる
import { expect, test } from "bun:test"
import { USER } from "../../../web/src/core/actor"
import type { ActionContext } from "../../../web/src/core/def/action"
import {
  type Folder,
  HOME_ID,
  type Library,
  systemFolderOf,
  TRASH_ID,
  withChanges,
} from "../../../web/src/core/folders"
import { type PerformedIn, performIn, type World } from "../../../web/src/core/perform"
import { draggable, droppable } from "../../../web/src/plugins/base/library/drop"
import { DOCUMENTS as DOCUMENTS_DEF, SYSTEM_FOLDER_ADD } from "../../../web/src/plugins/base/library/system-folders"
import { worldOf } from "../../../web/src/store/world"
import { CORE_CATALOG, newStore, sequence } from "../../support"

const NOW = "2026-11-19T01:00:00.000Z"
const DOCUMENTS = DOCUMENTS_DEF.id
const GONE = "@x/gone:folder" // 定義が機能台帳に無いシステムフォルダ（プラグインを外した間）
const SYSTEM_FOLDER_ADD_NAME = SYSTEM_FOLDER_ADD.id.slice("@matomezu/base:".length)
const JA = { "@matomezu/base:lang": "matomezu:ja" }

const ctxOf = (): ActionContext => ({
  catalog: CORE_CATALOG,
  controlCenter: "@matomezu/control-center:control-center",
  lang: "en",
  newId: sequence("sf"),
  now: NOW,
  today: "2026-11-19",
  actor: USER,
})

const run = (world: World, id: string, args: unknown = {}): PerformedIn =>
  performIn(world, `@matomezu/base:${id}`, args, undefined, ctxOf())
// 行えた結果の世界
const after = (world: World, done: PerformedIn): World => {
  if (!done.ok) throw new Error(`refused: ${JSON.stringify(done)}`)
  const tables = done.changes ? withChanges(world, done.changes) : world
  return { ...world, ...tables, ...(done.settings ? { settings: done.settings } : {}) }
}
const withRows = (world: World, ...rows: Folder[]): World => ({
  ...world,
  folders: { ...world.folders, ...Object.fromEntries(rows.map(r => [r.id, r])) },
})
const homeOf = (l: Library) => l.folders[HOME_ID]?.lineup ?? []

// 書庫ホームにドキュメント（sf1）と、定義の無いシステムフォルダ gone と、フォルダ f を足した世界
function prepared(settings = {}): World {
  const { state } = newStore({ now: () => NOW })
  const start = { ...worldOf(state.getState()), settings }
  const filled = after(start, run(start, SYSTEM_FOLDER_ADD_NAME))
  const home = filled.folders[HOME_ID]
  if (home?.folderRole !== "home") throw new Error("no home")
  return withRows(
    filled,
    { folderRole: "folder", id: "gone", systemFolder: GONE, lineup: [] },
    { folderRole: "folder", id: "f", title: "f", lineup: [] },
    {
      ...home,
      lineup: [home.lineup[0]!, { kind: "folder", id: "gone" }, ...home.lineup.slice(1), { kind: "folder", id: "f" }],
    },
  )
}

test("system-folder-add は、ドキュメントの行を書庫ホームの先頭に足し、もう在れば何も変えない", () => {
  const world = prepared()
  expect(homeOf(world)[0]).toEqual({ kind: "folder", id: "sf1" })
  expect(world.folders.sf1).toEqual({ folderRole: "folder", id: "sf1", systemFolder: DOCUMENTS, lineup: [] })
  const again = run(world, SYSTEM_FOLDER_ADD_NAME)
  expect(again).toEqual({ ok: true, result: { added: [], renamed: [] } })
})

test("システムフォルダの決まり: 動かす・名前を変える・定義の在る間にゴミ箱に入れる・先頭より前に置く・名前の当たる物を作るのは断る", () => {
  const world = prepared()
  const trashedGone = after(world, run(world, "entry-trash", { entry: "gone" }))
  // ゴミ箱に残っているドキュメント（外にもう 1 つ在る）
  const ghost = withRows(
    world,
    { folderRole: "folder", id: "old", systemFolder: DOCUMENTS, lineup: [] },
    { folderRole: "trash", id: TRASH_ID, lineup: [{ kind: "folder", id: "old", trashed: NOW, from: [HOME_ID] }] },
  )
  const rows: [string, World, string, unknown, boolean][] = [
    ["ドキュメントを、ほかのフォルダへ動かす", world, "entry-move", { entry: "sf1", into: "f" }, false],
    ["ドキュメントを、書庫ホームの中で動かす", world, "entry-move", { entry: "sf1", into: HOME_ID, index: 3 }, false],
    ["ドキュメントの名前を変える", world, "entry-rename", { entry: "sf1", title: "x" }, false],
    ["定義の在るドキュメントをゴミ箱に入れる", world, "entry-trash", { entry: "sf1" }, false],
    ["ほかの物を、システムフォルダより前に置く", world, "entry-move", { entry: "f", into: HOME_ID, index: 0 }, false],
    ["ほかの物を、システムフォルダの後に置く", world, "entry-move", { entry: "f", into: HOME_ID, index: 2 }, true],
    ["書庫ホームに、同じ名前のフォルダを作る", world, "folder-create", { title: "Documents" }, false],
    ["ドキュメントの中に、フォルダを作る", world, "folder-create", { title: "a", into: "sf1" }, true],
    ["定義の無いシステムフォルダの名前は数えない", world, "folder-create", { title: "gone" }, true],
    ["定義の無いシステムフォルダは、ゴミ箱に入れられる", world, "entry-trash", { entry: "gone" }, true],
    ["定義の無いシステムフォルダも、動かせない", world, "entry-move", { entry: "gone", into: "f" }, false],
    ["定義の無いシステムフォルダも、名前を変えられない", world, "entry-rename", { entry: "gone", title: "x" }, false],
    [
      "ゴミ箱の定義の無いシステムフォルダは、先頭の印の順の所へ戻る",
      trashedGone,
      "entry-restore",
      { entry: "gone" },
      true,
    ],
    ["外にもう在るドキュメントは、ゴミ箱から戻せない", ghost, "entry-restore", { entry: "old" }, false],
    ["ゴミ箱のドキュメントは消せる", ghost, "entry-purge", { entries: ["old"] }, true],
  ]
  for (const [what, w, id, args, ok] of rows) expect([what, run(w, id, args).ok]).toEqual([what, ok])
  const back = after(trashedGone, run(trashedGone, "entry-restore", { entry: "gone" }))
  expect(
    homeOf(back)
      .slice(0, 2)
      .map(r => systemFolderOf(back.folders[r.id])),
  ).toEqual([DOCUMENTS, GONE])
})

test("名前は利用者の設定の言語で引く: 日本語ならドキュメントと当たる物に番号を付け、言語を変えて当たるなら断る", () => {
  const { state } = newStore({ now: () => NOW })
  const start = worldOf(state.getState())
  const home = start.folders[HOME_ID]!
  const book = home.lineup.find(r => r.kind === "book")!.id
  // 書庫ホームのブックの名前を「ドキュメント」にしてから、日本語で足す
  const named = after(start, run(start, "entry-rename", { entry: book, title: "ドキュメント" }))
  const ja = { ...named, settings: JA }
  const done = run(ja, SYSTEM_FOLDER_ADD_NAME)
  expect(done.ok && done.result).toEqual({
    added: [{ folder: "sf1", systemFolder: DOCUMENTS }],
    renamed: [{ entry: book, kind: "book", from: "ドキュメント", to: "ドキュメント 2" }],
  })
  // 英語なら当たらない。そのあと日本語にするのは断る
  const en = after(named, run(named, SYSTEM_FOLDER_ADD_NAME))
  expect((en.folders[book] as { title?: string }).title).toBe("ドキュメント")
  const switched = run(en, "settings-set", { values: JA })
  expect(!switched.ok && "kind" in switched ? switched.kind : "ok").toBe("title-taken")
  // 当たる物の名前を変えれば、日本語にできる
  const renamed = after(en, run(en, "entry-rename", { entry: book, title: "本" }))
  expect(run(renamed, "settings-set", { values: JA }).ok).toBe(true)
})

test("プラグインが戻ってシステムフォルダの名前がまた引けると、当たる物に番号を付ける（行は足さない）", () => {
  const world = prepared()
  const home = world.folders[HOME_ID]!
  // プラグインが無い間に作った「Documents」（ドキュメントの名前が引けない間は、当たらない）
  const made = withRows(world, { folderRole: "folder", id: "u", title: "Documents", lineup: [] }, {
    ...home,
    lineup: [...home.lineup, { kind: "folder", id: "u" }],
  } as Folder)
  const done = run(made, SYSTEM_FOLDER_ADD_NAME)
  expect(done.ok && done.result).toEqual({
    added: [],
    renamed: [{ entry: "u", kind: "folder", from: "Documents", to: "Documents 2" }],
  })
})

test("書庫の画面: システムフォルダは掴めず、書庫ホームの先頭のシステムフォルダより前へは落とせない", () => {
  const world = prepared()
  expect(draggable(world.folders, "sf1")).toBe(false)
  expect(draggable(world.folders, "gone")).toBe(false)
  expect(droppable(world, "f", { to: "folder", into: HOME_ID, index: 0 })).toBe(false)
  expect(droppable(world, "f", { to: "folder", into: HOME_ID, index: 2 })).toBe(true)
  expect(droppable(world, "f", { to: "folder", into: "sf1" })).toBe(true)
})
