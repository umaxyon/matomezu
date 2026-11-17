// 読めないページ: 機能台帳で読めないページ（タイプが無い W027・タイプの形に合わない W028・タイプの決まりを守らない W029）は、ブックを読めるまま
// 読めないページのエントリ（id・名前・理由の番号だけ）になる。何もできず、同じフォルダに同じ値・同じ順で残り、無くなるのはブックごと消すときだけ

import { describe, expect, test } from "bun:test"
import { USER } from "../../web/src/core/actor"
import { checkBooks, findUnreadable, lostUnreadable, pagesOf, unreadableOf } from "../../web/src/core/book"
import { bookOf, changesBetween, recordsOf, tablesOf, withChanges } from "../../web/src/core/folders"
import { type PerformedIn, performIn, type World } from "../../web/src/core/perform"
import type { Book, UnreadableEntry } from "../../web/src/core/schema/book"
import { shownPageId } from "../../web/src/core/stage"
import { warningText } from "../../web/src/core/warnings"
import { stageIn } from "../../web/src/core/window"
import { isShown } from "../../web/src/store/commands"
import { DRAWING, drawingPage, SLIDE, testBinder, testBook, testPage } from "../lineup"
import { CORE_CATALOG, newStore, sequence, worldRows } from "../support"

const UNKNOWN = "@foo/stamps:board"
// タイプが機能台帳に無いページ（残したデータの形）
const stranger = (id: string, title: unknown = id) => ({ ...drawingPage(id), type: UNKNOWN, title }) as never
const unreadable = (id: string, title: string, code: UnreadableEntry["code"] = "W027"): UnreadableEntry => ({
  kind: "unreadable",
  id,
  title,
  code,
})
const connector = { id: "l", item: "@matomezu/line:connector-line", from: "a", to: "b", props: {} }

// 並びに読めないページ u1 を、スライドのバインダに読めないページ u2 を持つ、残したブック
const saved = testBook("b1", "B", [
  stranger("u1", "U"),
  drawingPage("p1", { title: "1" }),
  drawingPage("p2", { title: "2" }),
  testBinder("f1", "スライド", SLIDE, testPage(SLIDE, "s1", { title: "s" }), stranger("u2")),
])
const read = (): Book => {
  const [book] = checkBooks(CORE_CATALOG, [saved]).books
  if (!book) throw new Error("not read")
  return book
}

describe("残したブックを読む（checkBooks）", () => {
  test("タイプが機能台帳に無いページは W027 の読めないページになり、名前を残す（残したデータの名前が文字列でなければ空）。ブックは読める", () => {
    const done = checkBooks(CORE_CATALOG, [
      testBook("x1", "スタンプ帳", [drawingPage("q0", { title: "0" }), stranger("q1", "表紙")]),
      testBook("x2", "名無し", [stranger("q2", 3)]),
    ])
    expect(done.warnings).toEqual([])
    expect(done.books.map(b => b.lineup)).toEqual([
      [drawingPage("q0", { title: "0" }), unreadable("q1", "表紙")],
      [unreadable("q2", "")],
    ])
    expect(done.partial.map(warningText)).toEqual([
      "W027 @foo/stamps: book x1 (スタンプ帳): page q1 is of type @foo/stamps:board, which is not in the catalog (kept as it is, not readable)",
      "W027 @foo/stamps: book x2 (名無し): page q2 is of type @foo/stamps:board, which is not in the catalog (kept as it is, not readable)",
    ])
  })

  test("名前の無い読めないページが同じ並びに 2 枚あっても、ブックは読める（名前の無い物は、名前の重なりに数えない）", () => {
    const done = checkBooks(CORE_CATALOG, [testBook("x1", "名無し 2 枚", [stranger("q1", 3), stranger("q2", null)])])
    expect(done.warnings).toEqual([])
    expect(done.books.map(b => b.lineup)).toEqual([[unreadable("q1", ""), unreadable("q2", "")]])
  })

  test("残したデータに読めないページのエントリの形があれば、ブックごと読めない（W005。組むときにだけ作る形）", () => {
    const forged = { ...testBook("x1", "作った形", []), lineup: [unreadable("q1", "表紙")] }
    const done = checkBooks(CORE_CATALOG, [forged])
    expect(done.books).toEqual([])
    expect(done.warnings.map(w => w.code)).toEqual(["W005"])
  })

  test("タイプの形に合わないページは W028、タイプの決まりを守らないページ（線の端が無い）は W029。warning の持ち主はページのタイプのプラグイン", () => {
    const done = checkBooks(CORE_CATALOG, [
      testBook("x1", "形", [drawingPage("q1", { settings: { "@matomezu/tree:grow": "down" } } as never)]),
      testBook("x2", "線", [drawingPage("q2", { title: "P", items: [connector] })]),
    ])
    expect(done.books.map(b => b.lineup)).toEqual([
      [unreadable("q1", "ページ 1", "W028")],
      [unreadable("q2", "P", "W029")],
    ])
    expect(done.partial.map(warningText)).toEqual([
      "W028 @matomezu/drawing: book x1 (形): page q1 does not fit the shape of its type (kept as it is, not readable)",
      "W029 @matomezu/drawing: book x2 (線): page q2 breaks the rules of its type (kept as it is, not readable)",
    ])
  })

  test("1 冊に読めないページがいくつあっても、ページごとに 1 つの warning を並びの順に出す（バインダの中の物も）", () => {
    const done = checkBooks(CORE_CATALOG, [saved])
    expect(done.partial.map(w => [w.code, w.params.book, w.params.page])).toEqual([
      ["W027", "b1", "u1"],
      ["W027", "b1", "u2"],
    ])
    const [book] = done.books
    expect(book?.lineup[3]).toEqual(
      testBinder("f1", "スライド", SLIDE, testPage(SLIDE, "s1", { title: "s" }), unreadable("u2", "u2") as never),
    )
    expect(unreadableOf(book!).map(u => u.id)).toEqual(["u1", "u2"])
    expect(pagesOf(book!).map(p => p.id)).toEqual(["p1", "p2", "s1"])
    expect(findUnreadable(book!, "u2")?.binder?.id).toBe("f1")
    expect(findUnreadable(book!, "u1")?.binder).toBeNull()
    expect(findUnreadable(book!, "p1")).toBeUndefined()
  })

  test("タイプが機能台帳に無いバインダは、中が読めないページだけなら読める。読めるページが入っていれば読めない（W006）", () => {
    const only = testBook("x1", "X", [testBinder("g1", "g", UNKNOWN as never, stranger("q1"), stranger("q2"))])
    const mixed = testBook("x2", "Y", [testBinder("g2", "g", UNKNOWN as never, stranger("q3"), drawingPage("q4"))])
    const done = checkBooks(CORE_CATALOG, [only, mixed])
    expect(done.books.map(b => b.id)).toEqual(["x1"])
    expect(done.warnings.map(w => [w.code, w.params.book])).toEqual([["W006", "x2"]])
  })

  test("id の無いページはブックの形に合わず、ブックごと読めない（W005）", () => {
    const { id: _id, ...noId } = { ...drawingPage("q1"), type: UNKNOWN }
    const done = checkBooks(CORE_CATALOG, [testBook("x1", "X", [noId as never])])
    expect(done.books).toEqual([])
    expect(done.warnings.map(w => w.code)).toEqual(["W005"])
  })

  test("読めないページも並びの決まりに数える: 同じ並びの読めるページと名前・id が重なれば、ブックごと読めない（W006）", () => {
    const title = testBook("x1", "X", [drawingPage("q1", { title: "同じ" }), stranger("q2", "同じ")])
    const id = testBook("x2", "Y", [drawingPage("q3", { title: "a" }), stranger("q3", "b")])
    const inBinder = testBook("x3", "Z", [
      testBinder("g1", "g", SLIDE, testPage(SLIDE, "q4", { title: "同じ" }), stranger("q5", "同じ")),
    ])
    const done = checkBooks(CORE_CATALOG, [title, id, inBinder])
    expect(done.books).toEqual([])
    expect(done.warnings.map(w => [w.code, w.params.book])).toEqual([
      ["W006", "x1"],
      ["W006", "x2"],
      ["W006", "x3"],
    ])
  })
})

describe("表に分ける・組む（core/folders.ts）", () => {
  test("読めないページは、そのままページの表の 1 行になり、フォルダは kind が page の id で指す。組むと元のブックの値に戻る", () => {
    const book = read()
    const { folders, pages } = recordsOf(book)
    expect(folders.map(f => f.lineup)).toEqual([
      [
        { kind: "page", id: "u1" },
        { kind: "page", id: "p1" },
        { kind: "page", id: "p2" },
        { kind: "binder", id: "f1" },
      ],
      [
        { kind: "page", id: "s1" },
        { kind: "page", id: "u2" },
      ],
    ])
    expect(pages.filter(p => p.kind === "unreadable")).toEqual([unreadable("u1", "U"), unreadable("u2", "u2")])
    expect(bookOf(tablesOf([book]), "b1")).toBe(book)
    // 分けた物を写してから組んでも、同じ中身
    const copied = JSON.parse(JSON.stringify(tablesOf([book])))
    expect(bookOf(copied, "b1")).toEqual(book)
  })

  test("読めないページの行を書くのは、ブックが無くなるとき（removed）だけ。ほかのページ・フォルダを変えても書かない", () => {
    const book = read()
    const gone = changesBetween([book], [])
    expect(gone.pages).toMatchObject({ u1: "removed", u2: "removed" })
    const retitled = changesBetween([book], [{ ...book, title: "改" }])
    expect(retitled.pages).toEqual({})
    const reordered = changesBetween(
      [book],
      [{ ...book, lineup: [book.lineup[1]!, book.lineup[0]!, ...book.lineup.slice(2)] }],
    )
    expect(reordered.pages).toEqual({})
    expect(Object.keys(reordered.folders)).toEqual(["b1"])
  })

  test("lostUnreadable: 読めないページが同じフォルダに同じ値・同じ順で残り、増えていなければ null。動いた・消えた・変わった・増えた物は、その読めないページ", () => {
    const book = read()
    const [u1, p1, p2, f1] = book.lineup as [
      UnreadableEntry,
      Book["lineup"][number],
      Book["lineup"][number],
      Book["lineup"][number],
    ]
    expect(lostUnreadable(book, { ...book, lineup: [p1, u1, p2, f1] })).toBeNull()
    expect(lostUnreadable(book, { ...book, lineup: [p1, p2, f1] })).toEqual(u1)
    expect(lostUnreadable(book, { ...book, lineup: [{ ...u1, title: "改" }, p1, p2, f1] })).toEqual(u1)
    const extra = unreadable("u9", "増えた")
    expect(lostUnreadable(book, { ...book, lineup: [...book.lineup, extra] })).toEqual(extra)
    // 作るブックは、読めないページを持てない
    expect(lostUnreadable(undefined, book)).toEqual(u1)
    // バインダの外へ出すのも、保たない
    const binder = f1 as ReturnType<typeof testBinder>
    const out = { ...binder, lineup: binder.lineup.filter(p => p.id !== "u2") }
    expect(lostUnreadable(book, { ...book, lineup: [u1, p1, p2, out, unreadable("u2", "u2")] })).toEqual(
      unreadable("u2", "u2"),
    )
  })
})

describe("アクション（performIn）", () => {
  const ctx = {
    catalog: CORE_CATALOG,
    controlCenter: "@matomezu/control-center:control-center" as const,
    lang: "en" as const,
    newId: sequence("n"),
    now: "2026-01-01T00:00:00.000Z",
    actor: USER,
  }
  const worldOf = (books: readonly Book[]): World => ({
    ...tablesOf(books),
    settings: {},
    annotations: {},
    records: {},
    counters: {},
  })
  const run = (world: World, id: string, args: unknown, on?: object) =>
    performIn(world, id, args, on as never, ctx as never)
  // 行ったアクションが書くページの行（読めないページの行は、書かないか、removed だけ）
  const writtenRows = (done: PerformedIn) => (done.ok ? (done.changes?.pages ?? {}) : {})

  test("宛先（on.page）が読めないページのアクションは、読めない理由の番号を添えて断る", () => {
    const world = worldOf([read()])
    const refused = { ok: false, reason: "unreadable", page: "u1", code: "W027" } as const
    expect(run(world, "@matomezu/base:page-update", { title: "x" }, { page: "u1" })).toEqual(refused)
    expect(run(world, "@matomezu/base:page-lock", {}, { page: "u1" })).toEqual(refused)
    expect(run(world, "@matomezu/base:page-update", { title: "x" }, { page: "u2" })).toEqual({ ...refused, page: "u2" })
  })

  test("読めないページを消す・動かす・複製するアクションは断る（ページとして見つからない）。読めないページを中に持つバインダを消すのは、読めないページを挙げて断る", () => {
    const world = worldOf([read()])
    const refused = { ok: false, reason: "refused" } as const
    expect(run(world, "@matomezu/base:page-remove", { page: "u1" }, { book: "b1" })).toEqual(refused)
    expect(run(world, "@matomezu/base:page-remove", { page: "u2" }, { book: "b1" })).toEqual(refused)
    expect(run(world, "@matomezu/base:page-move", { page: "u1", index: 2 }, { book: "b1" })).toEqual(refused)
    expect(run(world, "@matomezu/base:page-duplicate", { page: "u1" }, { book: "b1" })).toEqual(refused)
    expect(run(world, "@matomezu/base:binder-remove", { binder: "f1" }, { book: "b1" })).toEqual({
      ok: false,
      reason: "unreadable",
      page: "u2",
      code: "W027",
    })
  })

  test("ほかのページを足す・動かす・ブックの名前を変える・バインダを動かすのは行え、読めないページの行は書かない", () => {
    const world = worldOf([read()])
    const done = [
      run(world, "@matomezu/base:page-add", { type: DRAWING, title: "足す" }, { book: "b1" }),
      run(world, "@matomezu/base:page-move", { page: "p2", index: 0 }, { book: "b1" }),
      run(world, "@matomezu/base:page-move", { page: "s1", index: 1 }, { book: "b1" }),
      run(world, "@matomezu/base:binder-move", { binder: "f1", index: 0 }, { book: "b1" }),
      run(world, "@matomezu/base:book-update", { title: "改" }, { book: "b1" }),
    ]
    expect(done.map(d => d.ok)).toEqual([true, true, true, true, true])
    for (const d of done) expect(Object.keys(writtenRows(d)).filter(id => id.startsWith("u"))).toEqual([])
  })

  test("読めないページの名前は、同じ並びのほかのページが使えない（足す・名前を変える・複製の名前）", () => {
    const world = worldOf([read()])
    const refused = { ok: false, reason: "refused" } as const
    expect(run(world, "@matomezu/base:page-add", { type: DRAWING, title: "U" }, { book: "b1" })).toEqual(refused)
    expect(run(world, "@matomezu/base:page-update", { title: "U" }, { page: "p1" })).toEqual(refused)
    expect(run(world, "@matomezu/base:page-update", { title: "u2" }, { page: "s1" })).toEqual(refused)
    expect(run(world, "@matomezu/base:page-duplicate", { page: "p1", title: "U" }, { book: "b1" })).toEqual(refused)
  })

  test("読めないページを中に持つバインダは、複製できない（読めないページを落とした写しを作らない）", () => {
    const world = worldOf([read()])
    expect(run(world, "@matomezu/base:binder-duplicate", { binder: "f1" }, { book: "b1" })).toEqual({
      ok: false,
      reason: "refused",
    })
  })

  test("ゴミ箱に入れる・戻すは読めないページの行を書かず、ゴミ箱から消すと読めないページの行も removed", () => {
    let world = worldOf([read()])
    const trashed = run(world, "@matomezu/base:book-trash", { book: "b1" })
    expect(trashed.ok).toBe(true)
    expect(writtenRows(trashed)).toEqual({})
    if (!trashed.ok || !trashed.changes) return
    world = { ...world, ...withChanges(world, trashed.changes) }
    const restored = run(world, "@matomezu/base:book-restore", { book: "b1" })
    expect(restored.ok).toBe(true)
    expect(writtenRows(restored)).toEqual({})
    const purged = run(world, "@matomezu/base:book-purge", { books: ["b1"] })
    expect(writtenRows(purged)).toMatchObject({ u1: "removed", u2: "removed" })
  })
})

describe("store", () => {
  const stageOf = (store: ReturnType<typeof newStore>) => stageIn(store.state.getState().window, "s1")
  const settled = () => Promise.resolve()

  test("最初のエントリが読めないページなら、ブックを開くとそれを開く（kind が unreadable で、見せるページは無い）。ページを開くでも開け、ほかのページが変わっても開いたまま", async () => {
    const store = newStore({ books: [], savedBooks: [saved] })
    expect(stageOf(store)?.opened).toEqual({ kind: "unreadable", book: "b1", page: "u1" })
    expect(shownPageId(stageOf(store)?.opened ?? null)).toBeNull()
    store.actions.openPage("s1", "p1")
    expect(stageOf(store)?.opened?.kind).toBe("page")
    store.actions.openPage("s1", "u2")
    expect(stageOf(store)?.opened).toEqual({ kind: "unreadable", book: "b1", page: "u2" })
    expect(store.actions.perform("@matomezu/base:page-update", { title: "改" }, { page: "p1" }).ok).toBe(true)
    await settled()
    expect(stageOf(store)?.opened).toEqual({ kind: "unreadable", book: "b1", page: "u2" })
  })

  test("タイプが機能台帳に無いバインダの中の読めないページを開いても、どのコマンドも出すかを問える（タイプの無いバインダで投げない）", () => {
    const book = testBook("c", "c", [
      drawingPage("p0", { title: "x" }),
      testBinder("g1", "g", UNKNOWN as never, stranger("q1")),
    ])
    const store = newStore({ books: [], savedBooks: [book] })
    store.actions.openPage("s1", "q1")
    expect(stageOf(store)?.opened).toEqual({ kind: "unreadable", book: "c", page: "q1" })
    for (const id of store.catalog.store.commands.keys())
      expect(() => isShown(store, store.state.getState(), "s1", id as never)).not.toThrow()
  })

  test("いくつ書き込んでも、戻す・やり直すをしても、読めないページの行は同じ値のまま。ホストへ送るアクションの引数にも、読めないページの中身は載らない", async () => {
    const sent: { action: string; args: unknown }[] = []
    const store = newStore({
      books: [],
      savedBooks: [saved],
      observe: d => {
        sent.push({ action: d.action, args: d.args })
        return undefined
      },
    })
    const { state, actions } = store
    const rows = () => [state.getState().pages.u1, state.getState().pages.u2]
    const before = rows()
    expect(before).toEqual([unreadable("u1", "U"), unreadable("u2", "u2")])
    expect(state.getState().partial.map(w => w.code)).toEqual(["W027", "W027"])
    expect(actions.perform("@matomezu/base:page-update", { title: "改" }, { page: "p1" }).ok).toBe(true)
    await settled()
    expect(actions.perform("@matomezu/base:page-move", { page: "p2", index: 0 }, { book: "b1" }).ok).toBe(true)
    await settled()
    expect(actions.perform("@matomezu/base:page-add", { type: DRAWING, title: "足す" }, { book: "b1" }).ok).toBe(true)
    await settled()
    expect(actions.perform("@matomezu/base:book-update", { title: "改" }, { book: "b1" }).ok).toBe(true)
    await settled()
    for (const _ of [1, 2, 3, 4]) expect(actions.command("s1", "@matomezu/base:undo")).toBe(true)
    expect(state.getState().books.b1).toEqual(read())
    for (const _ of [1, 2]) expect(actions.command("s1", "@matomezu/base:redo")).toBe(true)
    expect(rows()[0]).toBe(before[0])
    expect(rows()[1]).toBe(before[1])
    expect(unreadableOf(state.getState().books.b1!)).toEqual([unreadable("u1", "U"), unreadable("u2", "u2")])
    expect(sent.map(s => s.action)).toContain("@matomezu/base:book-revert")
    expect(JSON.stringify(sent)).not.toContain('"unreadable"')
  })

  test("ホストが知らせた世界（置き場所から読んだままのページとフォルダ）の読めないページも、読めないページの行にし、ブックは読める", () => {
    const store = newStore({ books: [] })
    store.receive({ ...worldRows([saved]), settings: {} }, [])
    expect(store.state.getState().pages.u1).toEqual(unreadable("u1", "U"))
    expect(store.state.getState().unreadable).toEqual([])
    expect(store.state.getState().partial.map(w => [w.code, w.params.page])).toEqual([
      ["W027", "u1"],
      ["W027", "u2"],
    ])
  })
})
