// システムフォルダ: 書庫を整える core の関数（withSystemFolders・withFreeTitles。常駐の settleLibrary が呼ぶ）が足りない行を書庫ホームの先頭に足し、名前の当たる物に番号を付ける。
// システムフォルダの決まり（印を変えない・定義が在る間はゴミ箱に入れない・先頭に固定・名前は設定の言語で引く）は、perform を通して確かめる
import { expect, test } from "bun:test"
import { USER } from "../../../web/src/core/actor"
import type { ActionContext } from "../../../web/src/core/def/action"
import { namingOf, withFreeTitles, withSystemFolders } from "../../../web/src/core/entries"
import { type Folder, HOME_ID, type Library, TRASH_ID } from "../../../web/src/core/folders"
import { withChanges } from "../../../web/src/core/folders-changes"
import { systemFolderOf } from "../../../web/src/core/folders-tree"
import { type PerformedIn, performIn, type World } from "../../../web/src/core/perform-world"
import { BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { draggable, droppable, moveClashOf } from "../../../web/src/plugins/base/library/drop"
import { replaceBlockedOf, restorePlanOf } from "../../../web/src/plugins/base/library/entries"
import { DOCUMENTS as DOCUMENTS_DEF } from "../../../web/src/plugins/base/library/system-folders"
import { worldOf } from "../../../web/src/store/world"
import { CORE_CATALOG, newStore, sequence, settleIn } from "../../support"

const NOW = "2026-11-19T01:00:00.000Z"
const DOCUMENTS = DOCUMENTS_DEF.id
const WORKROOMS = "@matomezu/base:workrooms"
const DRAWING = "@matomezu/drawing:drawing"
const GONE = "@x/gone:folder" // 定義が機能台帳に無いシステムフォルダ（プラグインを外した間）
const JA = { "@matomezu/base:lang": "matomezu:ja" }
const EN = { "@matomezu/base:lang": "matomezu:en" }

const ctxOf = (): Omit<ActionContext, "naming"> => ({
  catalog: CORE_CATALOG,
  controlCenter: BUILTIN_CONTROL_CENTER,
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
// 常駐が書庫を整えたあとの世界（足りないシステムフォルダを sf1, sf2, … で足し、名前の重なりに番号を付ける。名前は世界の設定の言語で引く）
const settledWorld = (world: World): World => {
  const filled = withSystemFolders(world, CORE_CATALOG, sequence("sf"))
  if (!filled) throw new Error("no home")
  return { ...world, ...withFreeTitles(filled.next, namingOf(CORE_CATALOG, world.settings)).next }
}

// 書庫ホームにドキュメント（sf1）・ワークルーム（sf2）と、定義の無いシステムフォルダ gone と、フォルダ f を足した世界
function prepared(settings = {}): World {
  const { state } = newStore({ now: () => NOW })
  const start = { ...worldOf(state.getState()), settings }
  const filled = settledWorld(start)
  const home = filled.folders[HOME_ID]
  if (home?.folderRole !== "home") throw new Error("no home")
  return withRows(
    filled,
    { folderRole: "folder", id: "gone", systemFolder: GONE, lineup: [] },
    { folderRole: "folder", id: "f", title: "f", lineup: [] },
    {
      ...home,
      lineup: [
        ...home.lineup.slice(0, 2),
        { kind: "folder", id: "gone" },
        ...home.lineup.slice(2),
        { kind: "folder", id: "f" },
      ],
    },
  )
}

test("書庫を整えると、ドキュメントの行を書庫ホームの先頭に足し、もう在れば何も足さない", () => {
  const world = prepared()
  expect(homeOf(world)[0]).toEqual({ kind: "folder", id: "sf1" })
  expect(world.folders.sf1).toEqual({ folderRole: "folder", id: "sf1", systemFolder: DOCUMENTS, lineup: [] })
  expect(withSystemFolders(world, CORE_CATALOG, sequence("again"))).toEqual({ next: world, added: [] })
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
    ["ほかの物を、システムフォルダの後に置く", world, "entry-move", { entry: "f", into: HOME_ID, index: 3 }, true],
    ["書庫ホームに、同じ名前のフォルダを作る", world, "folder-create", { title: "Documents" }, false],
    [
      "ページを、システムフォルダより前に作る",
      world,
      "page-create",
      { folder: HOME_ID, type: DRAWING, index: 0 },
      false,
    ],
    ["ページを、システムフォルダの後に作る", world, "page-create", { folder: HOME_ID, type: DRAWING, index: 3 }, true],
    ["ドキュメントの中に、ページを作る", world, "page-create", { folder: "sf1", type: DRAWING }, true],
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
      .slice(0, 3)
      .map(r => systemFolderOf(back.folders[r.id])),
  ).toEqual([DOCUMENTS, WORKROOMS, GONE])
})

test("名前は利用者の設定の言語で引く: 日本語ならドキュメントと当たる物に番号を付け、言語を変えて当たるなら断る", () => {
  const { state } = newStore({ now: () => NOW })
  const start = worldOf(state.getState())
  const home = start.folders[HOME_ID]!
  const book = home.lineup.find(r => r.kind === "book")!.id
  const titleIn = (w: World) => (w.folders[book] as { title?: string }).title
  // 書庫ホームのブックの名前を「ドキュメント」にしてから、日本語で整える
  const named = after(start, run(start, "entry-rename", { entry: book, title: "ドキュメント" }))
  expect(titleIn(settledWorld({ ...named, settings: JA }))).toBe("ドキュメント 2")
  // 英語を選んでいれば当たらない。そのあと日本語に変えるのは断る
  const en = settledWorld({ ...named, settings: EN })
  expect(titleIn(en)).toBe("ドキュメント")
  const switched = run(en, "settings-set", { values: JA })
  expect(!switched.ok && "kind" in switched ? switched.kind : "ok").toBe("title-taken")
  // 当たる物の名前を変えれば、日本語にできる
  const renamed = after(en, run(en, "entry-rename", { entry: book, title: "本" }))
  expect(run(renamed, "settings-set", { values: JA }).ok).toBe(true)
  // 言語を選んでいない所から初めて日本語を選ぶのは断らず、同じアクションで当たる物に番号を付ける
  const unset = settledWorld(named)
  const chosen = run(unset, "settings-set", { values: JA })
  expect(titleIn(after(unset, chosen))).toBe("ドキュメント 2")
})

test("日本語を選んでいれば、ブックをドキュメントの名前にするのは印を添えて断り、英語の名前（Documents）にはできる", () => {
  const store = newStore({ now: () => NOW, settings: JA })
  const { actions, state } = store
  expect(settleIn(store)).toMatchObject({ added: [{ systemFolder: DOCUMENTS }, { systemFolder: WORKROOMS }] })
  const book = state.getState().folders[HOME_ID]!.lineup.find(r => r.kind === "book")!.id
  expect(actions.perform("@matomezu/base:book-update", { title: "ドキュメント" }, { book })).toMatchObject({
    ok: false,
    kind: "title-taken",
    systemFolder: DOCUMENTS,
  })
  expect(actions.perform("@matomezu/base:entry-rename", { entry: book, title: "Documents" }).ok).toBe(true)
})

test("書庫を整えるとき、足りないのは定義の在るドキュメントがゴミ箱の外に無いときだけで、番号を付けるのは名前の当たる、システムフォルダでない物だけ", () => {
  const world = prepared()
  const home = world.folders[HOME_ID]!
  const book = home.lineup.find(r => r.kind === "book")!.id
  const inHome = (w: World, ref: Library["folders"][string]["lineup"][number]): Folder =>
    ({ ...w.folders[HOME_ID]!, lineup: [...w.folders[HOME_ID]!.lineup, ref] }) as Folder
  // 同じ名前の、別のプラグインのシステムフォルダ（システムフォルダどうしには番号を付けない。台帳アセンブルでは E132 になる）
  const TWIN = "@x/twin:docs"
  const twins = {
    ...CORE_CATALOG,
    systemFolders: new Map([...CORE_CATALOG.systemFolders, [TWIN, { ...DOCUMENTS_DEF, id: TWIN }]]),
  } as typeof CORE_CATALOG
  const withTwin = withRows(world, { folderRole: "folder", id: "twin", systemFolder: TWIN, lineup: [] }, {
    ...home,
    lineup: [home.lineup[0]!, home.lineup[1]!, { kind: "folder", id: "twin" }, ...home.lineup.slice(2)],
  } as Folder)
  const noDocuments = withRows(
    { ...world, folders: Object.fromEntries(Object.entries(world.folders).filter(([id]) => id !== "sf1")) },
    { ...home, lineup: home.lineup.filter(r => r.id !== "sf1") } as Folder,
  )
  const onlyInTrash = withRows(
    noDocuments,
    { folderRole: "folder", id: "old", systemFolder: DOCUMENTS, lineup: [] },
    { folderRole: "trash", id: TRASH_ID, lineup: [{ kind: "folder", id: "old", trashed: NOW, from: [HOME_ID] }] },
  )
  const pageNamed = {
    ...withRows(world, inHome(world, { kind: "page", id: "p" })),
    pages: { ...world.pages, p: { ...Object.values(world.pages)[0]!, id: "p", title: "Documents" } },
  } as World
  const bookNamed = withRows(world, { ...world.folders[book]!, title: "ドキュメント" } as Folder)
  const cases: [string, Library, typeof CORE_CATALOG, Record<string, string>, number, number][] = [
    ["揃っていて当たらない", world, CORE_CATALOG, {}, 0, 0],
    ["ドキュメントが無い", noDocuments, CORE_CATALOG, {}, 1, 0],
    ["ドキュメントはゴミ箱の中だけ", onlyInTrash, CORE_CATALOG, {}, 1, 0],
    ["定義の無いシステムフォルダが在っても、足さない", world, CORE_CATALOG, EN, 0, 0],
    ["同じ名前のシステムフォルダどうしは、番号を付けない", withTwin, twins, {}, 0, 0],
    ["書庫ホームのページと当たる", pageNamed, CORE_CATALOG, {}, 0, 1],
    ["日本語なら、ブックの「ドキュメント」と当たる", bookNamed, CORE_CATALOG, JA, 0, 1],
    ["言語を選んでいなければ（英語）、ブックの「ドキュメント」とは当たらない", bookNamed, CORE_CATALOG, {}, 0, 0],
  ]
  for (const [what, library, catalog, settings, adds, numbers] of cases) {
    const filled = withSystemFolders(library, catalog, sequence("in"))
    const freed = filled && withFreeTitles(filled.next, namingOf(catalog, settings)).freed
    expect([what, filled?.added.length, freed?.length]).toEqual([what, adds, numbers])
  }
})

test("プラグインが戻ってシステムフォルダの名前がまた引けると、当たる物に番号を付ける（行は足さない）", () => {
  const world = prepared()
  const home = world.folders[HOME_ID]!
  // プラグインが無い間に作った「Documents」（ドキュメントの名前が引けない間は、当たらない）
  const made = withRows(world, { folderRole: "folder", id: "u", title: "Documents", lineup: [] }, {
    ...home,
    lineup: [...home.lineup, { kind: "folder", id: "u" }],
  } as Folder)
  expect(withSystemFolders(made, CORE_CATALOG, sequence("in"))?.added).toEqual([])
  expect(withFreeTitles(made, namingOf(CORE_CATALOG, made.settings)).freed).toEqual([
    { kind: "folder", id: "u", title: "Documents 2" },
  ])
})

test("書庫の画面: システムフォルダは掴めず、書庫ホームの先頭のシステムフォルダより前へは落とせない", () => {
  const world = prepared()
  expect(draggable(world.folders, "sf1")).toBe(false)
  expect(draggable(world.folders, "gone")).toBe(false)
  expect(droppable(CORE_CATALOG, world, "f", { to: "folder", into: HOME_ID, index: 0 })).toBe(false)
  expect(droppable(CORE_CATALOG, world, "f", { to: "folder", into: HOME_ID, index: 3 })).toBe(true)
  expect(droppable(CORE_CATALOG, world, "f", { to: "folder", into: "sf1" })).toBe(true)
})

test("名前の当たる物がシステムフォルダなら、上書きできない訳を返し、上書きのダイアログは上書きを押せない形になる", () => {
  const world = prepared()
  const f = world.folders.f!
  // f の中の「Documents」を書庫ホームへ動かす／ゴミ箱に入れてから f もゴミ箱に入れ、書庫ホームへ戻す
  const inF = withRows(world, { folderRole: "folder", id: "d", title: "Documents", lineup: [] }, {
    ...f,
    lineup: [{ kind: "folder", id: "d" }],
  } as Folder)
  const dTrashed = after(inF, run(inF, "entry-trash", { entry: "d" }))
  const trashed = after(dTrashed, run(dTrashed, "entry-trash", { entry: "f" }))
  const naming = namingOf(CORE_CATALOG, world.settings)
  const clash = moveClashOf(inF, "d", { to: "folder", into: HOME_ID }, naming)
  expect(clash?.overwrite).toBe("system-folder")
  expect(replaceBlockedOf(clash!, { ok: true })).toEqual({ by: "rule", why: "system-folder" })
  expect(restorePlanOf(trashed, "d", naming)?.overwrite).toBe("system-folder")
  expect(run(inF, "entry-move-over", { entry: "d", into: HOME_ID, replaces: "sf1" }).ok).toBe(false)
})
