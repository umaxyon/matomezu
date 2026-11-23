// 印刷プレビューの設定の項目を持つ物（ステージエントリ: ブック・ブックの外のバインダ・ブックの外のページ 1 枚）と、それを変える print-preview-update（書庫が対象）。
// 世界は、テストの用意として書庫の表に直に置く
import { expect, test } from "bun:test"
import { z } from "zod"
import { USER } from "../../../web/src/core/actor"
import { defineAction } from "../../../web/src/core/def/action"
import { HOME_ID, type HomeFolder, type Library, type PlainFolder, TRASH_ID } from "../../../web/src/core/folders"
import { withChanges } from "../../../web/src/core/folders-changes"
import { performIn, permittedIn, type World } from "../../../web/src/core/perform-world"
import type { AnyPage, BinderEntry, Book } from "../../../web/src/core/schema/book"
import { NO_HOLDER, settingValue } from "../../../web/src/plugins/base/book-settings"
import { PRINT_PREVIEW_FLOW } from "../../../web/src/plugins/base/print-preview"
import { drawingPage, SLIDE, testBinder, testBook, testPage } from "../../lineup"
import { CORE_CATALOG, libraryWith, sequence } from "../../support"

const UPDATE = "@matomezu/base:print-preview-update"
const LOCK = "@matomezu/base:lock"
const FLOW = PRINT_PREVIEW_FLOW.id
const ROUTE = "@matomezu/line:line-route" // ページの項目（印刷プレビューの組でない）
const GONE = "@ex/gone:margin" // 機能台帳に無い項目
const CENTER = "@matomezu/control-center:control-center"
const NOW = "2026-01-01T00:00:00.000Z"
const slide = (id: string, title: string, rest: object = {}) => testPage(SLIDE, id, { title, ...rest }) as AnyPage

const ctxOf = (catalog = CORE_CATALOG) =>
  ({
    catalog,
    controlCenter: CENTER,
    lang: "en" as const,
    newId: sequence(),
    now: NOW,
    today: "2026-01-01",
    actor: USER,
  }) as unknown as Parameters<typeof performIn>[4]

interface Parts {
  book?: Partial<Omit<Book, "id" | "title" | "lineup">>
  page?: Partial<AnyPage>
  binderPages?: AnyPage[]
}

// 書庫ホームの直下に、ブック b1（ページ p1 と、バインダ bn〈中に q1〉）・ブックの外のページ x1・ブックの外のバインダ n1（中に s1・s2）・フォルダ a を置き、
// ゴミ箱に、ブック bt とブックの外のページ xt を入れた世界
function worldOf({ book = {}, page = {}, binderPages = [slide("s1", "1"), slide("s2", "2")] }: Parts = {}): World {
  const library = libraryWith(
    [
      testBook("b1", "ブック", [drawingPage("p1"), testBinder("bn", "中の束", SLIDE, slide("q1", "中"))], book),
      testBook("bt", "捨てたブック", [drawingPage("pt")]),
    ],
    [
      { ...drawingPage("x1", { title: "外" }), ...page } as AnyPage,
      testBinder("n1", "束", SLIDE, ...binderPages),
      drawingPage("xt", { title: "捨てたページ" }),
    ],
  )
  const home = library.folders[HOME_ID] as HomeFolder
  const a: PlainFolder = { folderRole: "folder", id: "a", title: "あ", lineup: [] }
  const binned = (kind: "book" | "page", id: string) => ({ kind, id, trashed: NOW, from: [HOME_ID] })
  return {
    pages: library.pages,
    folders: {
      ...library.folders,
      a,
      [HOME_ID]: {
        ...home,
        lineup: [...home.lineup.filter(r => r.id !== "bt" && r.id !== "xt"), { kind: "folder", id: "a" }],
      },
      [TRASH_ID]: { folderRole: "trash", id: TRASH_ID, lineup: [binned("book", "bt"), binned("page", "xt")] },
    },
    settings: {},
    annotations: {},
    records: {},
    counters: {},
  }
}

// 行った後の書庫（断られたら、その断り）
function after(world: World, args: unknown): Library | ReturnType<typeof performIn> {
  const done = performIn(world, UPDATE, args, undefined, ctxOf())
  return done.ok ? withChanges(world, done.changes ?? { pages: {}, folders: {} }) : done
}
// 書庫 library で、ステージエントリ id が持つ値を持つ行（ページか、ブック・バインダの行）
const holderOf = (library: Library, id: string) => library.pages[id] ?? library.folders[id]

test("ブック・ブックの外のバインダ・ブックの外のページ 1 枚に行うと、その物の値が変わる。null で既定に戻り、settings のフィールドも消える", () => {
  for (const id of ["b1", "n1", "x1"]) {
    const world = worldOf()
    const set = after(world, { entry: id, settings: { [FLOW]: "row" } }) as Library
    expect([id, settingValue(CORE_CATALOG, holderOf(set, id) ?? NO_HOLDER, PRINT_PREVIEW_FLOW)]).toEqual([id, "row"])
    // ほかのステージエントリの値は変わらない
    for (const other of ["b1", "n1", "x1"].filter(o => o !== id))
      expect([id, other, holderOf(set, other)]).toEqual([id, other, holderOf(world, other)])
    const back = after({ ...world, ...set }, { entry: id, settings: { [FLOW]: null } }) as Library
    expect([id, settingValue(CORE_CATALOG, holderOf(back, id) ?? NO_HOLDER, PRINT_PREVIEW_FLOW)]).toEqual([
      id,
      "column",
    ])
    expect([id, "settings" in (holderOf(back, id) ?? {})]).toEqual([id, false])
  }
})

test("ステージエントリでない物と、印刷プレビューの組でない項目・形に合わない値は、断る理由を添えて断る", () => {
  const NOT_ENTRY = "entry is not a book, or a page or a binder that is not in a book"
  const row = { [FLOW]: "row" }
  const rows: [string, unknown, string][] = [
    ["ブックの中のページ", { entry: "p1", settings: row }, NOT_ENTRY],
    ["ブックの中のバインダ", { entry: "bn", settings: row }, NOT_ENTRY],
    ["ブックの外のバインダの中のページ", { entry: "s1", settings: row }, NOT_ENTRY],
    ["フォルダ", { entry: "a", settings: row }, NOT_ENTRY],
    ["書庫ホーム", { entry: HOME_ID, settings: row }, NOT_ENTRY],
    ["ゴミ箱の中のブック", { entry: "bt", settings: row }, NOT_ENTRY],
    ["ゴミ箱の中のブックの外のページ", { entry: "xt", settings: row }, NOT_ENTRY],
    ["無い id", { entry: "nothing", settings: row }, NOT_ENTRY],
    ["印刷プレビューの組でない項目（ページの項目）", { entry: "b1", settings: { [ROUTE]: "elbow" } }, ROUTE],
    ["機能台帳に無い項目", { entry: "x1", settings: { [GONE]: "wide" } }, GONE],
    ["形に合わない値", { entry: "n1", settings: { [FLOW]: "diagonal" } }, FLOW],
  ]
  for (const [name, args, detail] of rows) {
    const done = performIn(worldOf(), UPDATE, args, undefined, ctxOf())
    expect([name, done]).toMatchObject([name, { ok: false, reason: "refused" }])
    expect([name, (done as { detail?: string }).detail ?? ""]).toEqual([name, expect.stringContaining(detail)])
  }
})

test("問う相手: ロックしたブックとロックしたブックの外のページは止まり、ブックの外のバインダは、中にロックしたページが在っても通る", () => {
  const denied = { ok: false, reason: "denied", permission: LOCK }
  const rows: [string, World, string, unknown][] = [
    ["ロックしたブック", worldOf({ book: { locked: true } }), "b1", denied],
    ["ロックしたブックの外のページ", worldOf({ page: { locked: true } }), "x1", { ...denied, page: "x1" }],
    [
      "ロックしたページを持つブックの外のバインダ",
      worldOf({ binderPages: [slide("s1", "1"), slide("s2", "2", { locked: true })] }),
      "n1",
      { ok: true },
    ],
  ]
  for (const [name, world, entry, answer] of rows) {
    const args = { entry, settings: { [FLOW]: "row" } }
    const before = permittedIn(world, UPDATE, args, undefined, ctxOf())
    const done = performIn(world, UPDATE, args, undefined, ctxOf())
    expect([name, before, done]).toMatchObject([name, answer, answer])
  }
})

// ブックが対象のアクションで、受けた並びのバインダに、引数 settings を設定の項目の値として書くアクション（settings が無ければ、名前だけ変えずに並びを組み直す。
// ブックにだけ行えるアクションでないよう、作るページのタイプで問う）
const SNEAK = "@ex/sneak:binder-settings"
const sneak = defineAction({
  id: SNEAK,
  title: "@matomezu/drawing:Drawing",
  aiDescription: "writes print preview settings onto the binder",
  attach: { books: true },
  target: "book",
  permissionScope: { creates: "type" },
  args: z.strictObject({ type: z.string(), settings: z.record(z.string(), z.string()).optional() }),
  run: (book, args) => {
    const lineup = book.lineup.map(e =>
      e.kind === "binder" ? ({ ...e, ...(args.settings ? { settings: args.settings } : {}) } as BinderEntry) : e,
    )
    return { next: { ...book, lineup }, result: {} }
  },
})

test("ブックが対象のアクションは、ブックの外のバインダの設定の項目の値を変えられない（変えた並びを返せば断る。値を持つバインダにほかの事は行え、値は残る）", () => {
  const catalog = {
    ...CORE_CATALOG,
    actions: new Map<string, unknown>([...CORE_CATALOG.actions, [SNEAK, sneak]]),
  } as unknown as typeof CORE_CATALOG
  const world = worldOf()
  const refused = { ok: false, reason: "refused" } as never
  expect(performIn(world, SNEAK, { type: SLIDE, settings: { [FLOW]: "row" } }, { book: "n1" }, ctxOf(catalog))).toEqual(
    refused,
  )
  const withValue = { ...world, ...(after(world, { entry: "n1", settings: { [FLOW]: "row" } }) as Library) }
  expect(
    performIn(withValue, SNEAK, { type: SLIDE, settings: { [FLOW]: "column" } }, { book: "n1" }, ctxOf(catalog)),
  ).toEqual(refused)
  const rows: [string, unknown, typeof catalog][] = [
    [SNEAK, { type: SLIDE }, catalog],
    ["@matomezu/base:page-add", { type: SLIDE, into: { binder: "n1" } }, CORE_CATALOG],
    ["@matomezu/base:page-duplicate", { page: "s2" }, CORE_CATALOG],
    ["@matomezu/base:page-move", { page: "s1", index: 1 }, CORE_CATALOG],
    ["@matomezu/base:page-remove", { page: "s2" }, CORE_CATALOG],
    ["@matomezu/base:pages-update", { pages: "all", settings: {} }, CORE_CATALOG],
    ["@matomezu/base:binder-update", { binder: "n1", orientation: "portrait" }, CORE_CATALOG],
  ]
  for (const [id, args, used] of rows) {
    const done = performIn(withValue, id, args, { book: "n1" }, ctxOf(used))
    const next = done.ok ? withChanges(withValue, done.changes ?? { pages: {}, folders: {} }) : withValue
    expect([
      id,
      done.ok ? "ok" : done,
      settingValue(CORE_CATALOG, next.folders.n1 ?? NO_HOLDER, PRINT_PREVIEW_FLOW),
    ]).toEqual([id, "ok", "row"])
  }
})
