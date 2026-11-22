// ステージエントリが持つ設定の項目（holder が "outermost" の項目）の値: 持てる物の形（ページ・バインダの settings）と、
// ブックかバインダの中へ入った物から、書庫が対象のアクションのあとに値を消すこと（core/perform-library.ts の normalizedLibrary）
import { expect, test } from "bun:test"
import { USER } from "../../web/src/core/actor"
import { readLibrary, unreadableUnitsOf } from "../../web/src/core/book"
import { HOME_ID, type HomeFolder, type Library, NO_CHANGES, type PlainFolder } from "../../web/src/core/folders"
import { withChanges } from "../../web/src/core/folders-changes"
import { outsideBinderIn } from "../../web/src/core/folders-tree"
import { LIBRARY_HISTORY } from "../../web/src/core/history"
import { performIn, type World } from "../../web/src/core/perform-world"
import type { AnyPage, BinderEntry } from "../../web/src/core/schema/book"
import { libraryRevertArgs } from "../../web/src/plugins/base/library/revert"
import { PRINT_PREVIEW_FLOW } from "../../web/src/plugins/base/print-preview"
import { drawingPage, SLIDE, testBinder, testBook, testPage } from "../lineup"
import { CORE_CATALOG, libraryWith, newStore, sequence, worldRows } from "../support"

const FLOW = PRINT_PREVIEW_FLOW.id
const ROUTE = "@matomezu/line:line-route" // 図面のページのタイプが選んだ、ページの項目
const GONE = "@ex/gone:margin" // 機能台帳に無い項目
const CENTER = "@matomezu/control-center:control-center"
const NOW = "2026-01-01T00:00:00.000Z"
const slide = (id: string, title: string, rest: object = {}) => testPage(SLIDE, id, { title, ...rest }) as AnyPage
const held = { [FLOW]: "row" } as never
const withSettings = (binder: BinderEntry, settings: object): BinderEntry => ({ ...binder, settings }) as BinderEntry

// 行 rows を読んだときの、読めない物（エントリの id と理由の番号）と、読めた書庫
function read(rows: { pages: unknown[]; folders: unknown[] }) {
  return {
    unreadable: unreadableUnitsOf(CORE_CATALOG, rows.pages, rows.folders).map(u => [u.element.id, u.code]),
    library: readLibrary(CORE_CATALOG, rows.pages, rows.folders).library,
  }
}

test("ページとバインダの設定の項目の値の形", () => {
  const grow = CORE_CATALOG.settings.get("@matomezu/tree:grow")?.default
  const rows: [string, { pages: unknown[]; folders: unknown[] }, [string, string][]][] = [
    [
      "ブックの外のページは、ステージエントリが持つ項目の値を受ける",
      worldRows([], [drawingPage("x1", { settings: held })]),
      [],
    ],
    [
      "ブックの中のページとバインダの中のページも、形としては受ける",
      worldRows(
        [testBook("b1", "B", [drawingPage("p1", { settings: held })])],
        [testBinder("n1", "束", SLIDE, slide("s1", "1", { settings: held }))],
      ),
      [],
    ],
    [
      "タイプが選んでいないページの項目を持つページは読めない",
      worldRows([], [drawingPage("x1", { settings: { "@matomezu/tree:grow": grow } } as never)]),
      [["x1", "W028"]],
    ],
    [
      "ブックの外のバインダは、ステージエントリが持つ項目の値を受ける",
      worldRows([], [withSettings(testBinder("n1", "束", SLIDE, slide("s1", "1")), held)]),
      [],
    ],
    [
      "値が形に合わないブックの外のバインダは読めない",
      worldRows([], [withSettings(testBinder("n1", "束", SLIDE, slide("s1", "1")), { [FLOW]: "diagonal" })]),
      [["n1", "W028"]],
    ],
    [
      "値が形に合わないブックの中のバインダは読めない",
      worldRows([
        testBook("b1", "B", [
          drawingPage("p1"),
          withSettings(testBinder("f1", "束", SLIDE, slide("s1", "1")), { [FLOW]: "diagonal" }),
        ]),
      ]),
      [["f1", "W028"]],
    ],
    [
      "ページの項目をバインダに持たせても読めない",
      worldRows([], [withSettings(testBinder("n1", "束", SLIDE, slide("s1", "1")), { [ROUTE]: "elbow" })]),
      [["n1", "W028"]],
    ],
    [
      "機能台帳に無い項目の値は、ページでもバインダでも読める",
      worldRows(
        [],
        [
          drawingPage("x1", { settings: { [GONE]: "wide" } } as never),
          withSettings(testBinder("n1", "束", SLIDE, slide("s1", "1")), { [GONE]: "wide" }),
        ],
      ),
      [],
    ],
  ]
  for (const [name, world, unreadable] of rows) expect([name, read(world).unreadable]).toEqual([name, unreadable])
  // 読めた物は、値をそのまま持つ
  const kept = read(
    worldRows(
      [],
      [
        drawingPage("x1", { settings: { [FLOW]: "row", [GONE]: "wide" } } as never),
        withSettings(testBinder("n1", "束", SLIDE, slide("s1", "1")), { [FLOW]: "row", [GONE]: "wide" }),
      ],
    ),
  ).library
  expect((kept.pages.x1 as { settings?: object }).settings).toEqual({ [FLOW]: "row", [GONE]: "wide" })
  expect(outsideBinderIn(kept, "n1")?.settings as object).toEqual({ [FLOW]: "row", [GONE]: "wide" })
})

const ctxOf = () =>
  ({
    catalog: CORE_CATALOG,
    controlCenter: CENTER,
    lang: "en" as const,
    newId: sequence(),
    now: NOW,
    today: "2026-01-01",
    actor: USER,
  }) as unknown as Parameters<typeof performIn>[4]

// 書庫ホームの直下に、ブック b1（ページ p1）・値を持つブックの外のページ x1（ページの項目の値と、機能台帳に無い項目の値も持つ）・
// 値を持つブックの外のバインダ n1（中に s1・s2）・値を持つ 1 枚だけのブックの外のバインダ m1（中に t1。t1 も値を持つ）・フォルダ a・c を置いた世界
function worldOf(x1: object = {}): World {
  const library = libraryWith(
    [testBook("b1", "ブック", [drawingPage("p1")])],
    [
      drawingPage("x1", { title: "外", settings: { [FLOW]: "row", [ROUTE]: "elbow", [GONE]: "wide" }, ...x1 } as never),
      withSettings(testBinder("n1", "束", SLIDE, slide("s1", "1"), slide("s2", "2")), held),
      withSettings(testBinder("m1", "一枚", SLIDE, slide("t1", "単", { settings: held })), held),
    ],
  )
  const home = library.folders[HOME_ID] as HomeFolder
  const folder = (id: string): PlainFolder => ({ folderRole: "folder", id, title: id, lineup: [] })
  return {
    pages: library.pages,
    folders: {
      ...library.folders,
      a: folder("a"),
      c: folder("c"),
      [HOME_ID]: {
        ...home,
        lineup: [...home.lineup, { kind: "folder", id: "a" }, { kind: "folder", id: "c" }],
      },
    },
    settings: {},
    annotations: {},
    records: {},
    counters: {},
  }
}

// world で書庫のアクション steps を順に行った後の書庫（断られたら、その断り）
function run(world: World, ...steps: [string, object][]): Library | { ok: false } {
  let now: Library = world
  for (const [id, args] of steps) {
    const done = performIn({ ...world, ...now }, `@matomezu/base:${id}`, args, undefined, ctxOf())
    if (!done.ok) return done
    now = withChanges(now, done.changes ?? NO_CHANGES)
  }
  return now
}
const settingsOf = (library: Library | { ok: false }, id: string) =>
  "pages" in library
    ? ((library.pages[id] ?? library.folders[id]) as { settings?: object } | undefined)?.settings
    : library

test("ブックかバインダの中へ入った物から、ステージエントリが持つ項目の値を消す（ページの項目と機能台帳に無い項目の値は残す）。中へ入らない動きでは消えない", () => {
  const rows: [string, [string, object][], string, object | undefined][] = [
    ["外のページをブックへ", [["entry-move", { entry: "x1", into: "b1" }]], "x1", { [ROUTE]: "elbow", [GONE]: "wide" }],
    ["外のバインダをブックへ", [["entry-move", { entry: "n1", into: "b1" }]], "n1", undefined],
    [
      "1 枚だけのバインダのページを、ほかの外のバインダへ",
      [["entry-move", { entry: "t1", into: "n1" }]],
      "t1",
      undefined,
    ],
    [
      "外のページをフォルダからフォルダへ",
      [
        ["entry-move", { entry: "x1", into: "a" }],
        ["entry-move", { entry: "x1", into: "c" }],
      ],
      "x1",
      { [FLOW]: "row", [ROUTE]: "elbow", [GONE]: "wide" },
    ],
    ["外のバインダをフォルダへ", [["entry-move", { entry: "n1", into: "a" }]], "n1", held],
    [
      "外のページをゴミ箱へ入れて戻す",
      [
        ["entry-trash", { entry: "x1" }],
        ["entry-restore", { entry: "x1" }],
      ],
      "x1",
      { [FLOW]: "row", [ROUTE]: "elbow", [GONE]: "wide" },
    ],
    [
      "外のバインダをゴミ箱へ入れて戻す",
      [
        ["entry-trash", { entry: "n1" }],
        ["entry-restore", { entry: "n1" }],
      ],
      "n1",
      held,
    ],
  ]
  for (const [name, steps, id, settings] of rows)
    expect([name, settingsOf(run(worldOf(), ...steps), id)]).toEqual([name, settings])
  // ほかの外のバインダへページが入っても、入った先のバインダ（ステージエントリ）の値は消えない
  expect(settingsOf(run(worldOf(), ["entry-move", { entry: "t1", into: "n1" }]), "n1")).toEqual(held)
  // ゴミ箱の中でも消えない
  expect(settingsOf(run(worldOf(), ["entry-trash", { entry: "x1" }]), "x1")).toEqual({
    [FLOW]: "row",
    [ROUTE]: "elbow",
    [GONE]: "wide",
  })
})

test("ロックしたブックの外のページも、値を持ったままブックへ動かせ、値は消える", () => {
  expect(settingsOf(run(worldOf({ locked: true }), ["entry-move", { entry: "x1", into: "b1" }]), "x1")).toEqual({
    [ROUTE]: "elbow",
    [GONE]: "wide",
  })
})

test("書庫の画面で、値を持つブックの外のページ・バインダをブックへ動かしてから戻すと、値も戻る", async () => {
  for (const id of ["x1", "n1"]) {
    const store = newStore({ now: () => NOW })
    const books = Object.values(store.state.getState().books)
    const outside = [
      drawingPage("x1", { title: "外", settings: held }),
      withSettings(testBinder("n1", "束", SLIDE, slide("s1", "1")), held),
    ]
    store.receive({ ...worldRows(books, outside), settings: {} }, [])
    const state = () => store.state.getState()
    const settings = () => ((state().pages[id] ?? state().folders[id]) as { settings?: object } | undefined)?.settings
    expect([id, store.actions.perform("@matomezu/base:entry-move", { entry: id, into: books[0]!.id }).ok]).toEqual([
      id,
      true,
    ])
    await Promise.resolve()
    expect([id, settings()]).toEqual([id, undefined])
    const step = state().history[LIBRARY_HISTORY]?.undo.at(-1)
    if (!step) throw new Error("no library step")
    const back = store.actions.perform("@matomezu/base:library-revert", libraryRevertArgs(step, "before"))
    expect([id, back.ok]).toEqual([id, true])
    await Promise.resolve()
    expect([id, settings()]).toEqual([id, held])
  }
})
