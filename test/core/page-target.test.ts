// ページが対象のアクション: run はページ 1 枚だけを受け、返したページがブックの同じ所へ戻る。使えるか・認可ステップ・ブックの決まりは、ページを持っているブックで確かめる
import { expect, test } from "bun:test"
import { z } from "zod"
import { USER } from "../../web/src/core/actor"
import { bindersOf, findPage, pagesOf } from "../../web/src/core/book"
import { defineAction } from "../../web/src/core/def/action"
import { bookOf, NO_CHANGES, tablesOf, withChanges } from "../../web/src/core/folders"
import { idMaker, idsIn } from "../../web/src/core/ids"
import { allowedOnBook, perform, performIn, permittedIn, runAction } from "../../web/src/core/perform"
import type { ItemPage } from "../../web/src/core/placed"
import type { Book } from "../../web/src/core/schema/book"
import { drawingPage, MARKDOWN, SLIDE, testBinder, testBook, testPage } from "../lineup"
import { CORE_CATALOG, sequence } from "../support"

const ADD = "test:box-add"
const RETITLE = "test:retitle"
const RENAME = "test:rename"
const SWAP = "test:swap"
const LOCK = "@matomezu/base:lock"

const box = (id: string) => ({ id, item: "@matomezu/box:shape-nest-box", x: 0, y: 0, props: { caption: id, body: "" } })

// ページに箱を 1 つ足す。id は、自分のページの中の id とだけ比べて振る
const add = defineAction({
  id: ADD,
  title: "@matomezu/base:Change pages",
  aiDescription: "",
  target: "page",
  attach: { items: ["@matomezu/box:shape-nest-box"] },
  permissionScope: "page",
  args: z.strictObject({}),
  run: (page, _args, ctx) => {
    const id = idMaker(ctx.newId, idsIn(page))()
    return { next: { ...page, items: [...(page.items ?? []), box(id)] } as ItemPage, result: { id } }
  },
})

// 名指した物の見出しを変える（許可スコープは、その物）
const retitle = defineAction({
  id: RETITLE,
  title: "@matomezu/base:Change pages",
  aiDescription: "",
  target: "page",
  attach: { pages: true },
  permissionScope: { item: "item" },
  args: z.strictObject({ item: z.string(), caption: z.string() }),
  run: (page, args) => {
    if (!page.items?.some(i => i.id === args.item)) return null
    const items = page.items.map(i => (i.id === args.item ? { ...i, props: { ...i.props, caption: args.caption } } : i))
    return { next: { ...page, items } as ItemPage, result: {} }
  },
})

// ページの名前を変える
const rename = defineAction({
  id: RENAME,
  title: "@matomezu/base:Change pages",
  aiDescription: "",
  target: "page",
  attach: { pages: true },
  permissionScope: "page",
  args: z.strictObject({ title: z.string() }),
  run: (page, args) => ({ next: { ...page, title: args.title }, result: {} }),
})

// id の違うページを返す（断られる）
const swap = defineAction({
  id: SWAP,
  title: "@matomezu/base:Change pages",
  aiDescription: "",
  target: "page",
  attach: { pages: true },
  permissionScope: "page",
  args: z.strictObject({}),
  run: page => ({ next: { ...page, id: "other" }, result: {} }),
})

const catalog = {
  ...CORE_CATALOG,
  actions: new Map<string, unknown>([
    ...CORE_CATALOG.actions,
    [ADD, add],
    [RETITLE, retitle],
    [RENAME, rename],
    [SWAP, swap],
  ]),
} as unknown as typeof CORE_CATALOG

const book = testBook("b1", "ブック", [
  drawingPage("p1", { items: [box("a")] }),
  drawingPage("p2", { title: "2", items: [box("b")], locked: true }),
  testPage(MARKDOWN, "m1", { title: "文書" }),
])
const ctxOf = (newId: () => string = sequence()) => ({
  catalog,
  controlCenter: null,
  lang: "en" as const,
  newId,
  now: "2026-01-01T00:00:00.000Z",
  actor: USER,
})
const act = (b: Book, page: string, id: string, args: unknown, newId?: () => string) =>
  perform({ book: b, page } as never, id as never, args as never, ctxOf(newId) as never)
const world = (...books: Book[]) => ({
  ...tablesOf(books),
  settings: {},
  annotations: {},
  records: {},
  counters: {},
})
const itemsOf = (b: Book, page: string) => (findPage(b, page)?.page.items ?? []).map(i => i.id)

test("run はページだけを受け、返したページがブックの同じ所へ戻る。ほかのページと並びは変わらない", () => {
  const done = act(book, "p1", RETITLE, { item: "a", caption: "新しい" })
  if (!done.ok) throw new Error(done.reason)
  const next = done.next as Book
  expect(findPage(next, "p1")?.page.items?.[0]?.props).toEqual({ caption: "新しい", body: "" })
  expect(next.lineup[1]).toBe(book.lineup[1])
  expect(next.lineup[2]).toBe(book.lineup[2])
  // バインダの中のページも、同じ所へ戻る
  const bound = testBook("b2", "綴じ", [
    testBinder("f1", "綴じ", SLIDE, testPage(SLIDE, "q1"), testPage(SLIDE, "q2", { title: "2" })),
  ])
  const inBinder = act(bound, "q2", RENAME, { title: "新しい名前" })
  if (!inBinder.ok) throw new Error(inBinder.reason)
  expect(pagesOf(inBinder.next as Book).map(p => p.title)).toEqual(["ページ 1", "新しい名前"])
  expect(bindersOf(inBinder.next as Book).map(f => f.id)).toEqual(["f1"])
})

test("ブックに無いページは no-page、id の違うページを返したら refused", () => {
  expect(act(book, "nope", ADD, {})).toMatchObject({ ok: false, reason: "no-page" })
  expect(act(book, "p1", SWAP, {})).toEqual({ ok: false, reason: "refused" })
})

test("使えるかは宛先のページのタイプで決まり、ロックは認可ステップがブックで止める", () => {
  // 文書のページには箱を置けない
  expect(act(book, "m1", ADD, {})).toEqual({ ok: false, reason: "not-allowed" })
  // ページのロック
  expect(act(book, "p2", ADD, {})).toEqual({ ok: false, reason: "denied", permission: LOCK })
  expect(act(book, "p2", RETITLE, { item: "b", caption: "x" })).toEqual({
    ok: false,
    reason: "denied",
    permission: LOCK,
  })
  // ブックのロック
  expect(act({ ...book, locked: true }, "p1", ADD, {})).toEqual({ ok: false, reason: "denied", permission: LOCK })
  // 引数が形に合わなければ bad-args（認可ステップが止めるなら、そちらが先）
  expect(act(book, "p1", RETITLE, { item: 1 })).toEqual({ ok: false, reason: "bad-args" })
  expect(act(book, "p2", RETITLE, { item: 1 })).toEqual({ ok: false, reason: "denied", permission: LOCK })
  expect(allowedOnBook(catalog, book, ADD, {}, "p1")).toBe(true)
  expect(allowedOnBook(catalog, book, ADD, {}, "m1")).toBe(false)
  expect(allowedOnBook(catalog, book, ADD, {})).toBe(false)
})

test("run が振る id は、そのページの中の id と重ならない（重なる値を飛ばす。同じ値の並びなら同じ id）。ほかのページの id とは重なってよい", () => {
  // 1 つ目の値は p1 の箱の id、2 つ目は短い id にすると p1 の箱の id、3 つ目は p1 そのものの id と重なる。4 つ目は p2 の箱の id（ほかのページなので使える）
  const values = () => {
    const list = ["a", "a-", "p1", "b"]
    return () => list.shift() ?? "spare"
  }
  const first = act(book, "p1", ADD, {}, values())
  const again = act(book, "p1", ADD, {}, values())
  expect(first).toMatchObject({ ok: true, result: { id: "b" } })
  expect(again).toMatchObject({ ok: true, result: { id: "b" } })
  // run だけを行う口も同じ id を振る
  const ran = runAction(add as never, { book, page: "p1" }, {}, ctxOf(values()) as never)
  expect(ran).toMatchObject({ result: { id: "b" } })
})

test("performIn は宛先のページを持っているブックで行い、変わったページだけを返す。ゴミ箱のブックのページと、どのブックにも無いページは no-page。行う前の問いも同じ答え", () => {
  const other = testBook("b3", "別", [drawingPage("x1")])
  const done = performIn(world(book, other), ADD, {}, { page: "x1" }, ctxOf())
  if (!done.ok) throw new Error(done.reason)
  // 書くのは、変えたページ 1 枚だけ（ブックのフォルダも、ほかのページも書かない）
  expect(Object.keys(done.changes?.pages ?? {})).toEqual(["x1"])
  expect(done.changes?.folders).toEqual({})
  const after = bookOf(withChanges(world(book, other), done.changes ?? NO_CHANGES), "b3")
  expect(itemsOf(after as Book, "x1")).toEqual(["n1"])
  expect(permittedIn(world(book, other), ADD, {}, { page: "x1" }, ctxOf())).toEqual({ ok: true })
  const cases = [world(book, { ...other, trashed: "2026-01-01T00:00:00.000Z" } as Book), world(book)]
  for (const w of cases) {
    expect(performIn(w, ADD, {}, { page: "x1" }, ctxOf())).toMatchObject({ ok: false, reason: "no-page" })
    expect(permittedIn(w, ADD, {}, { page: "x1" }, ctxOf())).toMatchObject({ ok: false, reason: "no-page" })
  }
  expect(performIn(world(book), ADD, {}, undefined, ctxOf())).toMatchObject({ ok: false, reason: "no-page" })
  expect(permittedIn(world(book), ADD, {}, { page: "p2" }, ctxOf())).toEqual({
    ok: false,
    reason: "denied",
    permission: LOCK,
  })
})
