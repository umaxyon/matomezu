// 並びを変えるアクション（base）: ページを足す所（ブックの並び・バインダ・新しいバインダ）、バインダのアクション、まとめて変える pages-update、
// 最初のページと一緒にブックを作る book-create、ページのタイプを替える結果を断る perform
import { describe, expect, test } from "bun:test"
import { USER } from "../../../web/src/core/actor"
import { findBinder, findPage, lineupOf, pagesIn, pagesOf, putPage } from "../../../web/src/core/book"
import { checkCoreCatalog } from "../../../web/src/core/core-catalog"
import { bookOf, tablesOf } from "../../../web/src/core/folders"
import { perform } from "../../../web/src/core/perform"
import type { ItemPage } from "../../../web/src/core/placed"
import type { Book } from "../../../web/src/core/schema/book"
import { BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import {
  BINDER_DUPLICATE,
  BINDER_MOVE,
  BINDER_REMOVE,
  BINDER_UPDATE,
} from "../../../web/src/plugins/base/pages/binders"
import { PAGE_ADD } from "../../../web/src/plugins/base/pages/page-add"
import { DRAWING, drawingPage, MARKDOWN, SLIDE, testBinder, testBook, testPage, withSlide } from "../../lineup"
import { BUILTIN_PARTS, CORE_CATALOG, NAMING, sequence } from "../../support"

const ctx = () => ({
  catalog: CORE_CATALOG,
  controlCenter: BUILTIN_CONTROL_CENTER,
  lang: "ja" as const,
  newId: sequence("n"),
  now: "2026-11-16T00:00:00.000Z",
  today: "2026-11-16",
  actor: USER,
  naming: NAMING,
})
const slide = (id: string) => testPage(SLIDE, id, { title: id, paper: "@matomezu/base:ratio-16x9" })
const book = testBook("b1", "混ざる", [
  drawingPage("p1"),
  testBinder("f1", "スライド", SLIDE, slide("s1"), slide("s2")),
])
const run = (b: Book, action: string, args: object) => perform(b as never, action as never, args as never, ctx())
const runOn = (b: Book, page: string, action: string, args: object) =>
  perform({ book: b, page } as never, action as never, args as never, ctx())

describe("page-add", () => {
  test("まとまらないタイプのページはブックの並びに、名前を渡さなければ重ならない（無題）で足す", () => {
    const done = run(book, PAGE_ADD.id, { type: MARKDOWN, index: 1 })
    expect(done).toMatchObject({ ok: true, result: { page: "n1" } })
    expect(done.ok && lineupOf(done.next).map(e => e.id)).toEqual(["p1", "n1", "f1"])
    expect(done.ok && findPage(done.next, "n1")?.page).toMatchObject({ type: MARKDOWN, title: "（無題）" })
    // まとまらないタイプに入れる所は書けない
    expect(run(book, PAGE_ADD.id, { type: DRAWING, into: { binder: "f1" } }).ok).toBe(false)
  })

  test("まとまるタイプは入れる所が要り、今あるバインダか、新しいバインダに入れる", () => {
    expect(run(book, PAGE_ADD.id, { type: SLIDE }).ok).toBe(false)
    const into = run(book, PAGE_ADD.id, { type: SLIDE, title: "s3", into: { binder: "f1" }, index: 0 })
    expect(into.ok && pagesIn(into.next, "f1").map(p => p.id)).toEqual(["n1", "s1", "s2"])
    const made = run(book, PAGE_ADD.id, { type: SLIDE, into: { newBinder: "発表" }, index: 0 })
    expect(made).toMatchObject({ ok: true, result: { page: "n1", binder: "n2" } })
    expect(made.ok && lineupOf(made.next).map(e => e.id)).toEqual(["n2", "p1", "f1"])
    expect(made.ok && findBinder(made.next, "n2")).toMatchObject({ title: "発表", pageType: SLIDE })
    expect(made.ok && pagesIn(made.next, "n2").map(p => p.id)).toEqual(["n1"])
    // 同じブックかバインダの中で同じ名前は付けられない
    expect(run(book, PAGE_ADD.id, { type: SLIDE, into: { newBinder: "スライド" } }).ok).toBe(false)
    expect(run(book, PAGE_ADD.id, { type: SLIDE, title: "s1", into: { binder: "f1" } }).ok).toBe(false)
  })
})

describe("バインダのアクション", () => {
  test("名前を変える・動かす（同じ並びの中）。ほかと同じ名前は断る", () => {
    const renamed = run(book, BINDER_UPDATE.id, { binder: "f1", title: "発表" })
    expect(renamed.ok && findBinder(renamed.next, "f1")?.title).toBe("発表")
    expect(run(book, BINDER_UPDATE.id, { binder: "f1", title: "ページ 1" }).ok).toBe(false)
    const moved = run(book, BINDER_MOVE.id, { binder: "f1", index: 0 })
    expect(moved.ok && lineupOf(moved.next).map(e => e.id)).toEqual(["f1", "p1"])
  })

  test("複製は中のページごと（id を振り直し、名前は「元の名前 2」）、削除は中のページごと", () => {
    const copied = run(book, BINDER_DUPLICATE.id, { binder: "f1" })
    expect(copied.ok).toBe(true)
    if (!copied.ok) return
    const [, , copy] = lineupOf(copied.next)
    expect(copy).toMatchObject({ kind: "binder", title: "スライド 2", pageType: SLIDE })
    const ids = copy?.kind === "binder" ? copy.lineup.map(p => p.id) : []
    expect(ids).toHaveLength(2)
    expect(ids.some(id => ["s1", "s2"].includes(id))).toBe(false)
    expect(copy?.kind === "binder" && copy.lineup.map(p => p.title)).toEqual(["s1", "s2"])
    const removed = run(book, BINDER_REMOVE.id, { binder: "f1" })
    expect(removed.ok && pagesOf(removed.next).map(p => p.id)).toEqual(["p1"])
  })
})

describe("pages-update", () => {
  const THEME = "@matomezu/base:page-theme"
  const TEXT_COLORS = "@matomezu/base:page-text-colors"

  test("全部のページの設定を 1 回で変え、ロックしたページと、その項目を選んでいないタイプのページは飛ばす", () => {
    const mixed = testBook("b2", "混ざる", [
      drawingPage("p1"),
      drawingPage("p2", { title: "2", locked: true }),
      testPage(MARKDOWN, "m1", { title: "文書" }),
    ])
    const done = run(mixed, "@matomezu/base:pages-update", {
      pages: "all",
      settings: { [TEXT_COLORS]: { "@matomezu/base:warn": "#111111" } },
    })
    expect(done).toMatchObject({ ok: true, result: { updated: ["p1"], skipped: ["p2", "m1"] } })
    // 名指したページだけ
    const one = run(mixed, "@matomezu/base:pages-update", {
      pages: ["m1"],
      settings: { [THEME]: "@matomezu/base:standard" },
    })
    expect(one).toMatchObject({ ok: true, result: { updated: ["m1"], skipped: [] } })
    // 名指したページが全部ロック中なら、ロックの認可ステップが止める。無いページを名指しても断る
    expect(
      run(mixed, "@matomezu/base:pages-update", { pages: ["p2"], settings: { [THEME]: "@matomezu/base:standard" } }),
    ).toEqual({ ok: false, reason: "denied", permission: "@matomezu/base:lock" })
    expect(
      run(mixed, "@matomezu/base:pages-update", { pages: ["nope"], settings: { [THEME]: "@matomezu/base:standard" } })
        .ok,
    ).toBe(false)
  })
})

test("book-create は、名前だけの空のブックか、最初のページと一緒に作る", () => {
  const made = perform(tablesOf([]), "@matomezu/base:book-create", { title: "新しい", page: { type: DRAWING } }, ctx())
  expect(made).toMatchObject({ ok: true, result: { book: "n1", page: { page: "n2" } } })
  expect(made.ok && pagesOf(bookOf(made.next, "n1")!).map(p => [p.id, p.type])).toEqual([["n2", DRAWING]])
  // 最初のページを作れなければ、ブックも作らない
  expect(perform(tablesOf([]), "@matomezu/base:book-create", { title: "x", page: { type: SLIDE } }, ctx()).ok).toBe(
    false,
  )
})

test("アクションの結果でページのタイプが替わっていたら、perform は断る", () => {
  const def = CORE_CATALOG.actions.get("@matomezu/base:page-update")!
  const swapped = {
    ...def,
    run: (p: ItemPage) => ({ next: { ...p, type: MARKDOWN }, result: {} }),
  }
  const catalog = { ...CORE_CATALOG, actions: new Map([...CORE_CATALOG.actions, [def.id, swapped]]) }
  expect(perform({ book, page: "p1" } as never, def.id as never, {} as never, { ...ctx(), catalog })).toEqual({
    ok: false,
    reason: "refused",
  })
})

test('台帳アセンブル: "book" スコープのアクションがタイプで決まる付く先を持つと E063、設定の項目の holder の書き違いは E064・E065', () => {
  const whole = BUILTIN_PARTS.actions.find(a => a.id === "@matomezu/base:book-update")!
  const typed = { ...whole, attach: { items: ["@matomezu/box:shape-nest-box"] } }
  expect(
    checkCoreCatalog({ ...BUILTIN_PARTS, actions: BUILTIN_PARTS.actions.map(a => (a === whole ? typed : a)) }).map(
      p => p.code,
    ),
  ).toEqual(["E063"])
  const [setting] = BUILTIN_PARTS.settings
  const [user] = BUILTIN_PARTS.userSettings
  const noHolder = { ...setting!, holder: undefined }
  const withHolder = { ...user!, holder: "page" }
  expect(
    checkCoreCatalog({
      ...BUILTIN_PARTS,
      settings: BUILTIN_PARTS.settings.map(s => (s === setting ? noHolder : s)),
      userSettings: BUILTIN_PARTS.userSettings.map(s => (s === user ? withHolder : s)),
    } as never)
      .map(p => p.code)
      .filter(c => c !== "E062"), // holder を外した項目を選んでいるタイプは、E062 にもなる
  ).toEqual(["E064", "E065"])
})

test("ロックしたページは、並びの中で動かせる・複製できる（中身は変えない）。無いバインダを名指せば refused", () => {
  const locked = putPage(book, { ...slide("s1"), locked: true } as never)
  expect(run(locked, "@matomezu/base:page-move", { page: "s1", index: 1 })).toMatchObject({ ok: true })
  expect(run(locked, "@matomezu/base:page-duplicate", { page: "s1" })).toMatchObject({ ok: true })
  expect(runOn(locked, "s1", "@matomezu/base:page-update", { title: "別" })).toMatchObject({
    ok: false,
    reason: "denied",
  })
  expect(run(book, BINDER_REMOVE.id, { binder: "nope" })).toEqual({ ok: false, reason: "refused" })
})

test("ブックが対象のアクションが振る id も、ブックのほかのページの中の id と重ならない（写したページの中の物の id）", () => {
  const shape = (id: string) => ({ id, item: "@matomezu/slide:slide-ellipse", x: 10, y: 10, w: 100, h: 60, props: {} })
  // newId は n1・n2・… の順。n1 はほかのページの形が使っている
  const two = testBook("b2", "2 枚", [
    testBinder(
      "b2-f1",
      "スライド",
      SLIDE,
      withSlide(slide("b2-s1"), [shape("a")]),
      withSlide(slide("b2-s2"), [shape("n1")]),
    ),
  ])
  const done = run(two, "@matomezu/base:page-duplicate", { page: "b2-s1" })
  expect(done).toMatchObject({ ok: true, result: { page: "n3" } })
  const copy = done.ok ? findPage(done.next, "n3")?.page : undefined
  expect((copy as { slide?: { id: string }[] } | undefined)?.slide?.map(i => i.id)).toEqual(["n2"])
})

test("図のページも複製できる: 中の物の id を振り直し、線の両端は写した形に付け替える。id を振り直すと壊れる形（データ）のあるページは断る", () => {
  const must = (done: ReturnType<typeof run>) => {
    if (!done.ok) throw new Error(`refused: ${done.reason}`)
    return done as { ok: true; next: Book; result: Record<string, string> }
  }
  const place = (b: Book, item: string) => must(runOn(b, "p1", "@matomezu/paper:item-place", { item, w: 120, h: 80 }))
  const a = place(book, "@matomezu/art:shape-pc")
  const b = place(a.next, "@matomezu/art:shape-db")
  const line = must(runOn(b.next, "p1", "@matomezu/line:line-connect", { from: a.result.item, to: b.result.item }))
  const done = must(run(line.next, "@matomezu/base:page-duplicate", { page: "p1" }))
  const of = (id: string) =>
    findPage(done.next, id)?.page as unknown as { title: string; items: Record<string, string>[] }
  const [from, copy] = [of("p1"), of(done.result.page ?? "")]
  expect(copy.title).toBe(`${from.title} 2`)
  expect(copy.items.map(i => i.item)).toEqual(from.items.map(i => i.item))
  // 写しの中の id は元と重ならず、線は写した形どうしを結ぶ
  const ids = (page: typeof copy) => page.items.map(i => i.id)
  expect(ids(copy).some(id => ids(from).includes(id))).toBe(false)
  const ends = (page: typeof copy) => page.items.flatMap(i => (i.from === undefined ? [] : [i.from, i.to]))
  expect(ends(copy).length).toBe(2)
  expect(ends(copy).every(id => id !== undefined && ids(copy).includes(id))).toBe(true)
  // データの形（軸が表の列の id を指す）のあるページは、種類を添えて断る
  const data = place(line.next, "@matomezu/data:shape-data")
  expect(run(data.next, "@matomezu/base:page-duplicate", { page: "p1" })).toMatchObject({
    ok: false,
    reason: "refused",
    kind: "@matomezu/base:unrenewable-shape",
  })
})

test("スライドのバインダの中は紙と向きがそろう: 足すページ・1 枚だけの変更は今の紙だけ、binder-update は全部のページに 1 回で付ける。別のバインダは別にそろう", () => {
  const A4 = "@matomezu/base:a4"
  const paperOf = (b: Book, id: string) => findPage(b, id)?.page.paper
  // 今のバインダと違う紙のページは足せず、1 枚だけ別の紙にもできない
  expect(run(book, PAGE_ADD.id, { type: SLIDE, into: { binder: "f1" }, paper: A4 })).toEqual({
    ok: false,
    reason: "refused",
  })
  expect(runOn(book, "s1", "@matomezu/base:page-update", { paper: A4 })).toEqual({
    ok: false,
    reason: "refused",
  })
  // バインダごと変える
  const done = run(book, BINDER_UPDATE.id, { binder: "f1", paper: A4 })
  expect(done.ok && pagesIn(done.next, "f1").map(p => p.paper)).toEqual([A4, A4])
  // 新しいバインダは、ほかのバインダの紙に縛られない
  const other = done.ok && run(done.next, PAGE_ADD.id, { type: SLIDE, into: { newBinder: "別のスライド" } })
  expect(other !== false && other.ok && paperOf(other.next, "n1")).toBe("@matomezu/base:ratio-16x9")
  // 何も渡さない・タイプに無い紙は断る
  expect(run(book, BINDER_UPDATE.id, { binder: "f1" })).toEqual({ ok: false, reason: "refused" })
  expect(run(book, BINDER_UPDATE.id, { binder: "f1", paper: "@x:nope" })).toEqual({ ok: false, reason: "refused" })
})
