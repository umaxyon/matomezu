import { describe, expect, test } from "bun:test"
import { z } from "zod"
import { findPage, pagesOf, putPage } from "../../web/src/core/book"
import { defineAction } from "../../web/src/core/def/action"
import { definePageType } from "../../web/src/core/def/page-type"
import { HOME_ID } from "../../web/src/core/folders"
import type { ItemPage } from "../../web/src/core/placed"
import type { StageLineup } from "../../web/src/core/schema/book"
import { NOTHING_OPENED, shownPageId } from "../../web/src/core/stage"
import { screenOf } from "../../web/src/core/window"
import { BUILTIN, BUILTIN_CONTROL_CENTER } from "../../web/src/plugins"
import { createBookIn } from "../../web/src/plugins/base"
import type { Actions } from "../../web/src/store/actions"
import { createMatomezu } from "../../web/src/store/create"
import { definePlugin } from "../../web/src/store/plugin"
import type { DoneAction, DoneBulk } from "../../web/src/store/state"
import { SAMPLE_BOOKS } from "../sample-books"
import { newStore, sequence, worldRows } from "../support"

// 追加プラグインの見本: 自分のページのタイプと、そのタイプで使えるアクション（core/catalog.ts には書き足さない）。
// アクションはページを名指し（許可スコープ { page }）、名指したページのタイプが add で足しているときだけ使える
const NOTE = definePageType({
  id: "notes:note",
  version: 1,
  title: "@matomezu/drawing:Drawing",
  grouping: "none",
  paper: { allowed: ["@matomezu/base:a4"], default: "@matomezu/base:a4", orientation: "portrait" },
  items: { allowed: [] },
  actions: { add: ["notes:rename" as never, "notes:break" as never, "notes:stamp" as never, "notes:date" as never] },
  theme: "@matomezu/base:standard",
  themeTypes: ["@matomezu/base:diagram"],
  presentation: "@matomezu/paper:paper", // 画面に出さないので、プレゼンテーションは表にあるものを借りる
  tokens: [],
})
const PAGE = z.strictObject({ page: z.string().min(1) })
// ページ page を f で替えたブック（無いページなら null）
const withPage = <B extends StageLineup>(book: B, page: string, f: (p: ItemPage) => ItemPage) => {
  const found = findPage(book, page)?.page
  return found ? putPage(book, f(found)) : null
}
const RENAME = defineAction({
  id: "notes:rename",
  title: "@matomezu/drawing:Drawing",
  aiDescription: "Rename a notes page.",
  target: "book",
  permissionScope: { page: "page" },
  args: PAGE.extend({ title: z.string().min(1) }),
  run: (book, args) => {
    const was = findPage(book, args.page)?.page.title
    const next = withPage(book, args.page, p => ({ ...p, title: args.title }))
    return next ? { next, result: { was } } : null
  },
})
// 型を言い張って、タイプの形に無いフィールドを書くアクション
const BREAK = defineAction({
  id: "notes:break",
  title: "@matomezu/drawing:Drawing",
  aiDescription: "Write a field the notes page does not have.",
  target: "book",
  permissionScope: { page: "page" },
  args: PAGE,
  run: (book, args) => {
    const next = withPage(book, args.page, p => Object.assign({}, p, { color: "red" }))
    return next ? { next, result: {} } : null
  },
})
// 行った時点をページの題名に書くアクション
const STAMP = defineAction({
  id: "notes:stamp",
  title: "@matomezu/drawing:Drawing",
  aiDescription: "Write the time into the notes page's title.",
  target: "book",
  permissionScope: { page: "page" },
  args: PAGE,
  run: (book, args, ctx) => {
    const next = withPage(book, args.page, p => ({ ...p, title: ctx.now }))
    return next ? { next, result: {} } : null
  },
})
// 行った日付をページの題名に書くアクション
const DATE = defineAction({
  id: "notes:date",
  title: "@matomezu/drawing:Drawing",
  aiDescription: "Write the date into the notes page's title.",
  target: "book",
  permissionScope: { page: "page" },
  args: PAGE,
  run: (book, args, ctx) => {
    const next = withPage(book, args.page, p => ({ ...p, title: ctx.today }))
    return next ? { next, result: {} } : null
  },
})
const notes = definePlugin({ id: "notes", pageTypes: [NOTE], actions: [RENAME, BREAK, STAMP, DATE] })
const untyped = (a: Actions) =>
  a as unknown as { perform(id: string, args: unknown, on?: { book: string } | { page: string }): unknown }
// メモのページを 1 枚入れたブック n1 を作る（ブックとページの id は newId の n1・n2）
const notesBook = (instance: ReturnType<typeof createMatomezu>) => {
  createBookIn(instance, "s1", { into: HOME_ID, title: "メモ", page: { type: "notes:note", title: "メモ" } as never })
}
const notePage = (instance: ReturnType<typeof createMatomezu>) => pagesOf(instance.state.getState().books.n1!)[0]!
// ホストから届く、メモのページ 1 枚のブック
const receivedBook = (title: string) => ({
  id: "n1",
  title: "メモ",
  lineup: [{ kind: "page", id: "n2", type: "notes:note", title, paper: "@matomezu/base:a4", orientation: "portrait" }],
})

describe("アクションの入口", () => {
  test("プラグインのアクションを行い、結果を状態に入れる", () => {
    const instance = createMatomezu({
      plugins: BUILTIN,
      controlCenter: BUILTIN_CONTROL_CENTER,
      books: SAMPLE_BOOKS,
      newId: sequence("n"),
    })
    instance.use([notes])
    notesBook(instance)
    expect(untyped(instance.actions).perform("notes:rename", { page: "n2", title: "新" }, { book: "n1" })).toEqual({
      ok: true,
      result: { was: "メモ" },
    })
    expect(notePage(instance)).toMatchObject({ title: "新" })
    // ほかのタイプのページには、そのタイプが許さないので使えない
    expect(untyped(instance.actions).perform("notes:rename", { page: "p1", title: "新" }, { book: "b1" })).toEqual({
      ok: false,
      reason: "not-allowed",
    })
  })

  test("アクションが返したページがタイプの形に合わなければ断り、ブックは変わらない", () => {
    const instance = createMatomezu({
      plugins: BUILTIN,
      controlCenter: BUILTIN_CONTROL_CENTER,
      newId: sequence("n"),
    })
    instance.use([notes])
    notesBook(instance)
    const before = instance.state.getState().books.n1
    expect(untyped(instance.actions).perform("notes:break", { page: "n2" }, { book: "n1" })).toEqual({
      ok: false,
      reason: "refused",
    })
    expect(instance.state.getState().books.n1).toBe(before)
  })

  test("アクションは行った時点を ctx.now で受け取り、知らせにも載り、行い直しでも同じ時点を使う", async () => {
    const done: DoneBulk[] = []
    const times = ["2026-10-26T01:00:00.000Z", "2026-10-26T02:00:00.000Z"]
    const instance = createMatomezu({
      plugins: BUILTIN,
      controlCenter: BUILTIN_CONTROL_CENTER,
      newId: sequence("n"),
      now: () => times.shift() ?? "later",
      observe: d => {
        done.push(d)
      },
    })
    instance.use([notes])
    notesBook(instance)
    await Promise.resolve()
    untyped(instance.actions).perform("notes:stamp", { page: "n2" }, { book: "n1" })
    expect(notePage(instance)).toMatchObject({ title: "2026-10-26T02:00:00.000Z" })
    await Promise.resolve()
    expect(done.at(-1)).toMatchObject([{ action: "notes:stamp", now: "2026-10-26T02:00:00.000Z" }])
    // ホストから届いたブックに、まだ確かめられていないアクションを行い直す
    instance.receive({ ...worldRows([receivedBook("メモ")]), settings: {} }, [done.at(-1)!])
    expect(notePage(instance)).toMatchObject({ title: "2026-10-26T02:00:00.000Z" })
  })

  test("アクションは時点と同じ時点の画面の暦の日付を ctx.today で受け取り、知らせにも載り、行い直しでも送った日付を使う", async () => {
    const was = process.env.TZ
    process.env.TZ = "Asia/Tokyo"
    try {
      const done: DoneBulk[] = []
      // UTC では 11/18、画面の暦（JST）では 11/19。時計を 2 回読むと、あとの読みは日付にならない
      const times = ["2026-10-26T01:00:00.000Z", "2026-11-18T23:30:00.000Z"]
      const instance = createMatomezu({
        plugins: BUILTIN,
        controlCenter: BUILTIN_CONTROL_CENTER,
        newId: sequence("n"),
        now: () => times.shift() ?? "later",
        observe: d => {
          done.push(d)
        },
      })
      instance.use([notes])
      notesBook(instance)
      await Promise.resolve()
      untyped(instance.actions).perform("notes:date", { page: "n2" }, { book: "n1" })
      expect(notePage(instance)).toMatchObject({ title: "2026-11-19" })
      await Promise.resolve()
      expect(done.at(-1)).toMatchObject([
        { action: "notes:date", now: "2026-11-18T23:30:00.000Z", today: "2026-11-19" },
      ])
      // 行い直しは、ここの暦でなく送った日付を使う
      const sent = { ...done.at(-1)![0]!, today: "2026-11-20" }
      instance.receive({ ...worldRows([receivedBook("メモ")]), settings: {} }, [[sent]])
      expect(notePage(instance)).toMatchObject({ title: "2026-11-20" })
    } finally {
      if (was === undefined) delete process.env.TZ
      else process.env.TZ = was
    }
  })

  test("行い直しの 1 つが投げても、受け取りは止まらず、あとの行い直しを続ける", async () => {
    const done: DoneBulk[] = []
    const instance = createMatomezu({
      plugins: BUILTIN,
      controlCenter: BUILTIN_CONTROL_CENTER,
      newId: sequence("n"),
      observe: d => {
        done.push(d)
      },
    })
    instance.use([notes])
    notesBook(instance)
    await Promise.resolve()
    untyped(instance.actions).perform("notes:stamp", { page: "n2" }, { book: "n1" })
    await Promise.resolve()
    const good = done.at(-1)![0]!
    const bad = {
      ...good,
      on: {
        get book(): string {
          throw new Error("boom")
        },
      },
    } as unknown as DoneAction
    instance.receive({ ...worldRows([receivedBook("メモ")]), settings: {} }, [[bad], [good]])
    expect(notePage(instance)).toMatchObject({ title: good.now })
  })

  test("ホストが断ったアクションを続けた画面の履歴の段に入れていたら、続ける前の画面の履歴の段は元に戻せるまま残る", async () => {
    const instance = createMatomezu({
      plugins: BUILTIN,
      controlCenter: BUILTIN_CONTROL_CENTER,
      newId: sequence("n"),
      observe: bulk =>
        Promise.resolve(
          bulk.some(d => (d.args as { title?: string }).title === "断られる")
            ? { ok: false, reason: "refused" }
            : { ok: true },
        ),
    })
    instance.use([notes])
    notesBook(instance)
    const act = untyped(instance.actions)
    act.perform("notes:rename", { page: "n2", title: "通る" }, { book: "n1" })
    await Promise.resolve()
    const first = instance.state.getState().history.n1?.undo.at(-1)
    expect(first?.pages.n2?.after).toMatchObject({ title: "通る" })
    // 続けた画面の履歴の段（continueStep）で別のアクションを行い、ホストが断る
    instance.actions.continueStep("n1")
    act.perform("notes:rename", { page: "n2", title: "断られる" }, { book: "n1" })
    await new Promise(r => setTimeout(r, 0))
    const undo = instance.state.getState().history.n1?.undo ?? []
    expect(undo.at(-1)).toBe(first)
    expect(undo.length).toBe(1)
    // 続ける前の画面の履歴の段で、また続けられる
    instance.actions.continueStep("n1")
    act.perform("notes:rename", { page: "n2", title: "続き" }, { book: "n1" })
    await new Promise(r => setTimeout(r, 0))
    expect(instance.state.getState().history.n1?.undo.length).toBe(1)
    expect(instance.state.getState().history.n1?.undo.at(-1)?.pages.n2?.after).toMatchObject({ title: "続き" })
  })

  test("ビルトインプラグインのアクションも同じ入口を通り、ブックを開いているステージを合わせる", () => {
    const ids = ["made", "first"]
    const { state, actions } = newStore({ newId: () => ids.shift() ?? "spare" })
    createBookIn({ state, actions }, "s1", { into: HOME_ID, title: "空" })
    actions.split("s1")
    actions.openBook("s2", "made")
    const done = actions.perform(
      "@matomezu/base:page-add",
      { type: "@matomezu/drawing:drawing", title: "最初" },
      { book: "made" },
    )
    expect(done).toEqual({ ok: true, result: { page: "first" } })
    expect(screenOf(state.getState().window).stages.map(s => shownPageId(s.opened ?? NOTHING_OPENED))).toEqual([
      "first",
      "first",
    ])
  })

  test("宛先のブックが無い・名指したページのタイプが許さない・引数の形が違うときは断り、状態を変えない", () => {
    const instance = newStore({ newId: sequence("n") })
    instance.use([notes])
    notesBook(instance)
    const { state, actions } = instance
    const before = state.getState()
    expect(
      actions.perform("@matomezu/base:page-add", { type: "@matomezu/drawing:drawing", title: "x" }, { book: "nope" }),
    ).toEqual({
      ok: false,
      reason: "no-book",
    })
    expect(actions.perform("@matomezu/line:line-connect", { from: "a", to: "b" }, { page: "n2" })).toEqual({
      ok: false,
      reason: "not-allowed",
    })
    expect(
      actions.perform("@matomezu/base:page-add", { type: "@matomezu/drawing:drawing", title: "" }, { book: "b1" }),
    ).toEqual({
      ok: false,
      reason: "bad-args",
    })
    // ページのタイプで決まるアクションも、引数の形が違えば bad-args（所が出せないので、タイプでは断らない）、宛先のページが無ければ no-page
    expect(untyped(actions).perform("@matomezu/line:line-connect", { from: 1 }, { page: "n2" })).toEqual({
      ok: false,
      reason: "bad-args",
    })
    expect(actions.perform("@matomezu/line:line-connect", { from: "a", to: "b" }, { page: "nope" })).toMatchObject({
      ok: false,
      reason: "no-page",
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
      actions.perform("@matomezu/base:page-add", { type: "@matomezu/drawing:drawing", title: "x" })
      // @ts-expect-error 設定のアクションに宛先は渡さない
      actions.perform("@matomezu/base:settings-set", { values: { "@matomezu/base:lang": "en" } }, { book: "b1" })
      // @ts-expect-error 引数の型が違う
      actions.perform("@matomezu/base:page-add", { type: "@matomezu/drawing:drawing", title: 1 }, { book: "b1" })
    }
    expect(typeof typeOnly).toBe("function")
  })
})
