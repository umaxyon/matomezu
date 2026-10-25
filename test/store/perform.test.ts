import { describe, expect, test } from "bun:test"
import { z } from "zod"
import { defineAction } from "../../web/src/core/def/action"
import { defineBookType } from "../../web/src/core/def/book-type"
import { BUILTIN } from "../../web/src/plugins"
import { createMatomezu } from "../../web/src/store/create"
import { definePlugin } from "../../web/src/store/plugin"
import type { Actions } from "../../web/src/store/store"
import { newStore } from "../support"

// 追加プラグインの見本: 自分のブックのタイプと、そのタイプで使えるアクション（機能台帳の型の側には書き足さない）
const NOTE = defineBookType({
  id: "notes/note",
  version: 1,
  title: "Drawing",
  schema: z.strictObject({ type: z.literal("notes/note"), id: z.string().min(1), title: z.string() }),
  single: false,
  create: init => ({ type: "notes/note" as const, ...init }),
  pages: null,
  items: { allowed: [], defaults: [] },
  actions: { allowed: ["notes/rename"], defaults: ["notes/rename"] },
  theme: "standard",
  presentation: "master", // 画面に出さないので、見せ方は表にあるものを借りる
  tokens: [],
})
const RENAME = defineAction({
  id: "notes/rename",
  title: "Drawing",
  target: "book",
  needs: [],
  args: z.strictObject({ title: z.string().min(1) }),
  run: (book, args) => ({ next: { ...book, title: args.title }, result: { was: (book as { title?: string }).title } }),
})
const notes = definePlugin({ id: "notes", bookTypes: [NOTE], actions: [RENAME] })
const untyped = (a: Actions) => a as unknown as { perform(id: string, args: unknown, on?: { book: string }): unknown }

describe("アクションの入口", () => {
  test("プラグインのアクションを行い、結果を状態に入れる", () => {
    const instance = createMatomezu({ plugins: [...BUILTIN, notes], partial: true, home: "master", newId: () => "n1" })
    instance.actions.createBook("s1", { title: "メモ", type: "notes/note" })
    expect(untyped(instance.actions).perform("notes/rename", { title: "新" }, { book: "n1" })).toEqual({
      ok: true,
      result: { was: "メモ" },
    })
    expect(instance.state.getState().books.n1).toMatchObject({ title: "新" })
    // ほかのタイプのブックには、そのタイプが許さないので使えない
    expect(untyped(instance.actions).perform("notes/rename", { title: "新" }, { book: "master" })).toEqual({
      ok: false,
      reason: "not-allowed",
    })
  })

  test("ビルトインプラグインのアクションも同じ入口を通り、ブックを開いているステージを合わせる", () => {
    const { state, actions } = newStore({ newId: () => "made" })
    actions.createBook("s1", { title: "空", type: "drawing" })
    actions.split("s1")
    actions.openBook("s2", "made")
    const done = actions.perform("page.add", { title: "最初" }, { book: "made" })
    expect(done).toEqual({ ok: true, result: { page: "made" } })
    expect(state.getState().workspace.stages.map(s => s.opened?.page)).toEqual(["made", "made"])
  })

  test("宛先のブックが無い・タイプが許さない・引数の形が違うときは断り、状態を変えない", () => {
    const { state, actions } = newStore()
    const before = state.getState()
    expect(actions.perform("page.add", { title: "x" }, { book: "nope" })).toEqual({ ok: false, reason: "no-book" })
    expect(actions.perform("page.add", { title: "x" }, { book: "master" })).toEqual({
      ok: false,
      reason: "not-allowed",
    })
    expect(actions.perform("page.add", { title: "" }, { book: "b1" })).toEqual({ ok: false, reason: "bad-args" })
    expect(state.getState()).toBe(before)
  })

  test("設定のアクションは宛先を渡さず、同じ値なら知らせない", () => {
    const { state, actions } = newStore()
    let calls = 0
    const off = state.subscribe(() => calls++)
    expect(actions.perform("settings.lang", { lang: "ja" })).toEqual({ ok: true, result: {} })
    expect(calls).toBe(0)
    expect(actions.perform("settings.lang", { lang: "en" }).ok).toBe(true)
    expect(calls).toBe(1)
    off()
  })

  test("宛先の型: ブックが対象なら宛先が要り、ほかは渡さない（型を確かめるだけで、行わない）", () => {
    const { actions } = newStore()
    const typeOnly = () => {
      // @ts-expect-error ブックが対象のアクションには宛先が要る
      actions.perform("page.add", { title: "x" })
      // @ts-expect-error 設定のアクションに宛先は渡さない
      actions.perform("settings.lang", { lang: "en" }, { book: "b1" })
      // @ts-expect-error 引数の型が違う
      actions.perform("page.add", { title: 1 }, { book: "b1" })
    }
    expect(typeof typeOnly).toBe("function")
  })
})
