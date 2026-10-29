import { describe, expect, test } from "bun:test"
import { z } from "zod"
import { defineAction, pagedOnly } from "../../web/src/core/def/action"
import { defineBookType } from "../../web/src/core/def/book-type"
import { BUILTIN } from "../../web/src/plugins"
import { createBookIn } from "../../web/src/plugins/base"
import { createMatomezu } from "../../web/src/store/create"
import { definePlugin } from "../../web/src/store/plugin"
import type { Actions, DoneAction } from "../../web/src/store/store"
import { newStore } from "../support"

// 追加プラグインの見本: 自分のブックのタイプと、そのタイプで使えるアクション（core/catalog.ts には書き足さない）
const NOTE = defineBookType({
  id: "notes:note",
  version: 1,
  title: "@matomezu/drawing:Drawing",
  schema: z.strictObject({ type: z.literal("notes:note"), id: z.string().min(1) }),
  single: false,
  create: init => ({ type: "notes:note" as const, ...init }),
  pages: null,
  items: { allowed: [], defaults: [] },
  actions: { add: ["notes:rename" as never, "notes:break" as never, "notes:stamp" as never] },
  theme: "@matomezu/base:standard",
  presentation: "@matomezu/master:master", // 画面に出さないので、見せ方は表にあるものを借りる
  tokens: [],
})
const RENAME = defineAction({
  id: "notes:rename",
  title: "@matomezu/drawing:Drawing",
  aiDescription: "Rename a notes book.",
  target: "book",
  args: z.strictObject({ title: z.string().min(1) }),
  run: (book, args) => ({ next: { ...book, title: args.title }, result: { was: (book as { title?: string }).title } }),
})
// 型を言い張って、タイプの形に無いフィールドを書くアクション
const BREAK = defineAction({
  id: "notes:break",
  title: "@matomezu/drawing:Drawing",
  aiDescription: "Write a field the notes book does not have.",
  target: "book",
  args: z.strictObject({}),
  run: book => ({ next: Object.assign({}, book, { color: "red" }), result: {} }),
})
// 行った時点を題名に書くアクション
const STAMP = defineAction({
  id: "notes:stamp",
  title: "@matomezu/drawing:Drawing",
  aiDescription: "Write the time into the notes book's title.",
  target: "book",
  args: z.strictObject({}),
  run: (book, _args, ctx) => ({ next: { ...book, title: ctx.now }, result: {} }),
})
const notes = definePlugin({ id: "notes", bookTypes: [NOTE], actions: [RENAME, BREAK, STAMP] })
const untyped = (a: Actions) => a as unknown as { perform(id: string, args: unknown, on?: { book: string }): unknown }

describe("アクションの入口", () => {
  test("プラグインのアクションを行い、結果を状態に入れる", () => {
    const instance = createMatomezu({ plugins: BUILTIN, home: "@matomezu/master:master", newId: () => "n1" })
    instance.use([notes])
    createBookIn(instance, "s1", { title: "メモ", type: "notes:note" as never })
    expect(untyped(instance.actions).perform("notes:rename", { title: "新" }, { book: "n1" })).toEqual({
      ok: true,
      result: { was: "メモ" },
    })
    expect(instance.state.getState().books.n1).toMatchObject({ title: "新" })
    // ほかのタイプのブックには、そのタイプが許さないので使えない
    expect(
      untyped(instance.actions).perform("notes:rename", { title: "新" }, { book: "@matomezu/master:master" }),
    ).toEqual({
      ok: false,
      reason: "not-allowed",
    })
  })

  test("アクションが返したブックがタイプの形に合わなければ断り、ブックは変わらない", () => {
    const instance = createMatomezu({ plugins: BUILTIN, home: "@matomezu/master:master", newId: () => "n1" })
    instance.use([notes])
    createBookIn(instance, "s1", { title: "メモ", type: "notes:note" as never })
    const before = instance.state.getState().books.n1
    expect(untyped(instance.actions).perform("notes:break", {}, { book: "n1" })).toEqual({
      ok: false,
      reason: "refused",
    })
    expect(instance.state.getState().books.n1).toBe(before)
  })

  test("アクションは行った時点を ctx.now で受け取り、知らせにも載り、行い直しでも同じ時点を使う", () => {
    const done: DoneAction[] = []
    const times = ["2026-10-26T01:00:00.000Z", "2026-10-26T02:00:00.000Z"]
    const instance = createMatomezu({
      plugins: BUILTIN,
      home: "@matomezu/master:master",
      newId: () => "n1",
      now: () => times.shift() ?? "later",
      observe: d => done.push(d),
    })
    instance.use([notes])
    createBookIn(instance, "s1", { title: "メモ", type: "notes:note" as never })
    untyped(instance.actions).perform("notes:stamp", {}, { book: "n1" })
    expect(instance.state.getState().books.n1).toMatchObject({ title: "2026-10-26T02:00:00.000Z" })
    expect(done.at(-1)).toMatchObject({ action: "notes:stamp", now: "2026-10-26T02:00:00.000Z" })
    // ホストから届いたブックに、まだ確かめられていないアクションを行い直す
    const book = { type: "notes:note", id: "n1", title: "メモ" }
    instance.receive({ books: [book], settings: {} }, [done.at(-1)!])
    expect(instance.state.getState().books.n1).toMatchObject({ title: "2026-10-26T02:00:00.000Z" })
  })

  test("ビルトインプラグインのアクションも同じ入口を通り、ブックを開いているステージを合わせる", () => {
    const { state, actions } = newStore({ newId: () => "made" })
    createBookIn({ state, actions }, "s1", { title: "空", type: "@matomezu/drawing:drawing" })
    actions.split("s1")
    actions.openBook("s2", "made")
    const done = actions.perform("@matomezu/base:page-add", { title: "最初" }, { book: "made" })
    expect(done).toEqual({ ok: true, result: { page: "made" } })
    expect(state.getState().workspace.stages.map(s => s.opened?.page)).toEqual(["made", "made"])
  })

  test("宛先のブックが無い・タイプが許さない・引数の形が違うときは断り、状態を変えない", () => {
    const { state, actions } = newStore()
    const before = state.getState()
    expect(actions.perform("@matomezu/base:page-add", { title: "x" }, { book: "nope" })).toEqual({
      ok: false,
      reason: "no-book",
    })
    expect(actions.perform("@matomezu/base:page-add", { title: "x" }, { book: "@matomezu/master:master" })).toEqual({
      ok: false,
      reason: "not-allowed",
    })
    expect(actions.perform("@matomezu/base:page-add", { title: "" }, { book: "b1" })).toEqual({
      ok: false,
      reason: "bad-args",
    })
    expect(state.getState()).toBe(before)
  })

  test("設定のアクションは宛先を渡さず、同じ値なら知らせない", () => {
    const { state, actions } = newStore()
    let calls = 0
    const off = state.subscribe(() => calls++)
    const lang = { values: { "@matomezu/base:lang": "matomezu:en" } }
    expect(actions.perform("@matomezu/base:settings-set", lang).ok).toBe(true)
    expect(calls).toBe(1)
    expect(actions.perform("@matomezu/base:settings-set", lang)).toEqual({ ok: true, result: {} })
    expect(calls).toBe(1)
    off()
  })

  test("宛先の型: ブックが対象なら宛先が要り、ほかは渡さない（型を確かめるだけで、行わない）", () => {
    const { actions } = newStore()
    const typeOnly = () => {
      // @ts-expect-error ブックが対象のアクションには宛先が要る
      actions.perform("@matomezu/base:page-add", { title: "x" })
      // @ts-expect-error 設定のアクションに宛先は渡さない
      actions.perform("@matomezu/base:settings-lang", { lang: "en" }, { book: "b1" })
      // @ts-expect-error 引数の型が違う
      actions.perform("@matomezu/base:page-add", { title: 1 }, { book: "b1" })
    }
    expect(typeof typeOnly).toBe("function")
  })
})

test("付く先がページを持つタイプだけ（pages・items）のアクションの run は PagedBook を受ける。books・presentations も書いたら Book のまま", () => {
  expect(pagedOnly({ pages: true })).toBe(true)
  expect(pagedOnly({ items: ["@matomezu/box:shape-nest-box"] })).toBe(true)
  expect(pagedOnly({ items: ["@matomezu/box:shape-nest-box"], books: true })).toBe(false)
  expect(pagedOnly({ presentations: ["@matomezu/paper:paper"] })).toBe(false)
  expect(pagedOnly(undefined)).toBe(false)
  defineAction({
    id: "t:paged",
    title: "@matomezu/master:Master",
    attach: { pages: true },
    aiDescription: "",
    target: "book",
    args: z.strictObject({}),
    run: book => ({ next: book, result: book.pages.length }), // pages を言い張りなしで読める
  })
  defineAction({
    id: "t:any",
    title: "@matomezu/master:Master",
    attach: { books: true },
    aiDescription: "",
    target: "book",
    args: z.strictObject({}),
    // @ts-expect-error どのタイプにも付くアクションには、ページの無いブックも来る
    run: book => ({ next: book, result: book.pages.length }),
  })
})
