// ページの紙・向き・伸びるか: page-add で決め、page-update であとから変える（plugins/base/page-tabs）

import { expect, test } from "bun:test"
import { z } from "zod"
import { findPage, pagesOf, putPage } from "../../web/src/core/book"
import { defineAction } from "../../web/src/core/def/action"
import { definePageType } from "../../web/src/core/def/page-type"
import type { ItemPage } from "../../web/src/core/placed"
import type { Book } from "../../web/src/core/schema/book"
import { BUILTIN, BUILTIN_CONTROL_CENTER } from "../../web/src/plugins"
import { createBookIn } from "../../web/src/plugins/base"
import { normalizedPage } from "../../web/src/plugins/base/pages/pages"
import { withGrows } from "../../web/src/plugins/base/place/grow"
import { DRAWING } from "../../web/src/plugins/page-types/drawing/drawing"
import { createMatomezu } from "../../web/src/store/create"
import { definePlugin } from "../../web/src/store/plugin"
import { CORE_CATALOG, newStore, sequence } from "../support"

type Drawing = Book

test("紙と向きはあとから変えられ、形が紙からはみ出す変更は断る。図面のページは可変ページにでき、そうすれば紙の外へ広がってよい", () => {
  const { state, actions } = newStore()
  const pages = () => pagesOf(state.getState().books.b1 as Drawing)
  expect(
    actions.perform(
      "@matomezu/base:page-add",
      { type: "@matomezu/drawing:drawing", title: "p", orientation: "landscape" },
      { book: "b1" },
    ).ok,
  ).toBe(true)
  const page = pages().at(-1)?.id as string
  const update = (args: object) => actions.perform("@matomezu/base:page-update", { ...args }, { page }).ok
  expect(
    actions.perform(
      "@matomezu/paper:item-place",
      { item: "@matomezu/box:shape-nest-box", at: { x: 900, y: 100 } },
      { page },
    ).ok,
  ).toBe(true)
  // A4 横（1123 幅）の右寄りの箱は、A5 横（794 幅）にも縦の向きにも入らない
  expect(update({ paper: "@matomezu/base:a5" })).toBe(false)
  expect(update({ orientation: "portrait" })).toBe(false)
  expect(update({ paper: "@matomezu/base:a3" })).toBe(true)
  expect(update({ orientation: "portrait" })).toBe(true)
  expect(pages().at(-1)).toMatchObject({ paper: "@matomezu/base:a3", orientation: "portrait" })
  // 表に無い紙は選べない
  expect(update({ paper: "@matomezu/base:b9" })).toBe(false)
  // 図面のページは可変ページにでき、既定の向き（右と下）へ広がるので、A5 にも入る。選べない向きは断る
  expect(update({ grows: true })).toBe(true)
  expect(update({ paper: "@matomezu/base:a5" })).toBe(true)
  expect(pages().at(-1)).toMatchObject({ paper: "@matomezu/base:a5", grows: "right-down" })
  expect(update({ grows: "left" })).toBe(false)
  // 右だけに変えると、高さは紙 1 枚に収める（A5 横の高さ 559 には入る）。下だけなら、右寄りの箱は A5 の幅に入らない
  expect(update({ grows: "right" })).toBe(true)
  expect(update({ grows: "down" })).toBe(false)
})

// 伸びられるタイプの見本（core/catalog.ts には書き足さないので、インスタンスは partial で作る）
const SHEET = definePageType({
  id: "notes:sheet",
  version: 1,
  title: "@matomezu/drawing:Drawing",
  grouping: "none",
  paper: {
    allowed: ["@matomezu/base:a4", "@matomezu/base:a3"],
    default: "@matomezu/base:a4",
    orientation: "portrait",
  },
  grow: { sides: () => ({ up: false, down: true, left: false, right: true }) },
  items: { allowed: [] },
  actions: {},
  theme: "@matomezu/base:standard",
  themeTypes: ["@matomezu/base:diagram"],
  presentation: "@matomezu/paper:paper", // 画面に出さないので、プレゼンテーションは表にあるものを借りる
  tokens: [],
})

test("伸びられるタイプのページは、作るときもあとからも可変ページにでき、grows は向きの次に並ぶ。バインダに入らないタイプのページは、ほかのページがあっても紙を変えられる", () => {
  const ids = ["n1", "n2", "n3"]
  const instance = createMatomezu({
    plugins: [...BUILTIN, definePlugin({ id: "notes", pageTypes: [SHEET] })],
    partial: true,
    controlCenter: BUILTIN_CONTROL_CENTER,
    newId: () => ids.shift() ?? "nx",
  })
  const perform = instance.actions.perform as (id: string, args: unknown, on: unknown) => { ok: boolean }
  const pages = () => pagesOf(instance.state.getState().books.n1!)
  expect(createBookIn(instance, "s1", { title: "表" })).toBe(true)
  expect(perform("@matomezu/base:page-add", { type: "notes:sheet", title: "p", grows: true }, { book: "n1" }).ok).toBe(
    true,
  )
  expect(Object.keys(pages()[0] ?? {})).toEqual(["kind", "id", "type", "title", "paper", "orientation", "grows"])
  // タイプが向きを決めるなら grows は true だけ（向きは選べない）
  expect(pages()[0]?.grows).toBe(true)
  expect(perform("@matomezu/base:page-update", { grows: "down" }, { page: "n2" }).ok).toBe(false)
  expect(perform("@matomezu/base:page-update", { grows: false }, { page: "n2" }).ok).toBe(true)
  expect("grows" in (pages()[0] ?? {})).toBe(false)
  expect(perform("@matomezu/base:page-update", { paper: "@matomezu/base:a3" }, { page: "n2" }).ok).toBe(true)
  expect(perform("@matomezu/base:page-add", { type: "notes:sheet", title: "q" }, { book: "n1" }).ok).toBe(true)
  expect(pages()[1]).toMatchObject({ paper: "@matomezu/base:a4" })
  expect(perform("@matomezu/base:page-update", { paper: "@matomezu/base:a4" }, { page: "n2" }).ok).toBe(true)
})

// 下へだけ伸びられる、形を置くタイプの見本（図面のページのタイプを借りる）
const SCROLL = definePageType({
  ...DRAWING,
  id: "notes:scroll",
  grow: { choices: ["down"] },
})

test("可変ページは、伸びない向き（下へだけ伸びるなら横）だけ紙 1 枚に収まればよい。伸びるのをやめるのは、形が紙 1 枚に入るときだけ", () => {
  const instance = createMatomezu({
    plugins: [...BUILTIN, definePlugin({ id: "notes", pageTypes: [SCROLL] })],
    partial: true,
    controlCenter: BUILTIN_CONTROL_CENTER,
    newId: sequence(),
  })
  const perform = instance.actions.perform as (id: string, args: unknown, on: unknown) => { ok: boolean }
  expect(createBookIn(instance, "s1", { title: "巻物" })).toBe(true)
  const book = Object.keys(instance.state.getState().books)[0] as string
  const pages = () => pagesOf(instance.state.getState().books[book]!)
  expect(
    perform(
      "@matomezu/base:page-add",
      { type: "notes:scroll", title: "p", orientation: "portrait", grows: true },
      { book },
    ).ok,
  ).toBe(true)
  const page = pages()[0]?.id as string
  const place = (x: number, y: number) =>
    perform("@matomezu/paper:item-place", { item: "@matomezu/box:shape-nest-box", at: { x, y } }, { page }).ok
  const update = (args: object) => perform("@matomezu/base:page-update", { ...args }, { page }).ok
  // A4 縦（794×1123）の下の方の箱は、A5 縦（559×794）の高さを越えるが、下へ伸びるので入る
  expect(place(40, 900)).toBe(true)
  expect(update({ paper: "@matomezu/base:a5" })).toBe(true)
  // 伸びるのをやめると、A5 1 枚には入らない
  expect(update({ grows: false })).toBe(false)
  expect(update({ paper: "@matomezu/base:a4", grows: false })).toBe(true)
  // 横に寄った箱は、下へだけ伸びる可変ページでも横は紙 1 枚に収める
  expect(update({ grows: true })).toBe(true)
  expect(place(600, 40)).toBe(true)
  expect(update({ paper: "@matomezu/base:a5" })).toBe(false)
})

test("上下左右へ伸びる可変ページは、左・上に空きの印刷区画を 1 つ持つ。左の空きへ置けば中身を 印刷区画 1 つ分右へずらし、左端の印刷区画が空けば詰める（ずらした量はページの shift）", () => {
  const { state, actions } = newStore()
  const pages = () => pagesOf(state.getState().books.b1 as Drawing)
  expect(
    actions.perform(
      "@matomezu/base:page-add",
      { type: "@matomezu/drawing:drawing", title: "p", orientation: "landscape" },
      { book: "b1" },
    ).ok,
  ).toBe(true)
  const page = pages().at(-1)?.id as string
  const at = () =>
    pages().find(p => p.id === page) as unknown as {
      shift?: { x: number; y: number }
      items: { id: string; x: number; y: number }[]
    }
  const place = (x: number, y: number) =>
    (
      actions.perform(
        "@matomezu/paper:item-place",
        { item: "@matomezu/box:shape-nest-box", at: { x, y } },
        { page },
      ) as { ok: boolean; result?: { item: string } }
    ).result?.item
  const first = place(100, 100) as string
  // 可変ページにすると、左と上に空きの印刷区画を 1 つずつ持つよう中身が 印刷区画 1 つ分ずつずれる（A4 横は 1123×794）
  expect(actions.perform("@matomezu/base:page-update", { grows: "all" }, { page }).ok).toBe(true)
  expect(at().shift).toEqual({ x: 1, y: 1 })
  expect(at().items.find(i => i.id === first)).toMatchObject({ x: 1223, y: 894 })
  // 左の空きの印刷区画へ置くと、全体が印刷区画 1 つ分右へずれる
  const left = place(50, 900) as string
  expect(at().shift).toEqual({ x: 2, y: 1 })
  expect(at().items.find(i => i.id === left)).toMatchObject({ x: 1173, y: 900 })
  expect(at().items.find(i => i.id === first)).toMatchObject({ x: 2346, y: 894 })
  // 左の箱を消すと、空いた左端の印刷区画を詰める
  expect(actions.perform("@matomezu/paper:item-remove", { items: [left] }, { page }).ok).toBe(true)
  expect(at().shift).toEqual({ x: 1, y: 1 })
  expect(at().items.find(i => i.id === first)).toMatchObject({ x: 1223, y: 894 })
  // ページの設定のダイアログが確かめる下書き（normalizedPage）も、アクションのあとと同じく空きを詰めてから紙に入るかを見る
  const book = state.getState().books.b1 as Drawing
  const off = withGrows(findPage(book, page)?.page as ItemPage, undefined)
  expect(normalizedPage(CORE_CATALOG, findPage(book, page)?.page, off)).toMatchObject({ items: [{ x: 100, y: 100 }] })
  // 可変ページをやめると、空きを詰めて紙 1 枚に戻す
  expect(actions.perform("@matomezu/base:page-update", { grows: false }, { page }).ok).toBe(true)
  expect(at().shift).toBeUndefined()
  expect(at().items.find(i => i.id === first)).toMatchObject({ x: 100, y: 100 })
})

// ページの shift を自分で書くアクションの見本（図面のブックに足す）
const SHIFTER = defineAction({
  id: "notes:shift",
  title: "@matomezu/drawing:Drawing",
  aiDescription: "Write a page's shift.",
  target: "book",
  attach: { books: true },
  permissionScope: "book",
  args: z.strictObject({ page: z.string() }),
  run: (book, args) => ({
    next: putPage(book, {
      ...(findPage(book, args.page)?.page as ItemPage),
      shift: { x: 1, y: 0 },
    }),
    result: {},
  }),
})

test("ページの shift は可変ページを整えるステップだけが書く。アクションが書けば断る", () => {
  const instance = createMatomezu({
    plugins: [...BUILTIN, definePlugin({ id: "notes", actions: [SHIFTER] })],
    partial: true,
    controlCenter: BUILTIN_CONTROL_CENTER,
    newId: sequence(),
  })
  const perform = instance.actions.perform as (
    id: string,
    args: unknown,
    on: unknown,
  ) => { ok: boolean; reason?: string }
  expect(createBookIn(instance, "s1", { title: "図" })).toBe(true)
  const book = Object.keys(instance.state.getState().books)[0] as string
  expect(perform("@matomezu/base:page-add", { type: "@matomezu/drawing:drawing", title: "p" }, { book }).ok).toBe(true)
  const page = pagesOf(instance.state.getState().books[book] as Drawing)[0]?.id
  expect(perform("notes:shift", { page }, { book })).toMatchObject({ ok: false, reason: "refused" })
})

test("フローチャートの可変ページは、流れの始まりの側を固定する。下へなら左に空きの印刷区画を持ち（上は持たない）、右へに変えると左を詰めて上に持つ", () => {
  const store = newStore()
  const { state, actions } = store
  const before = new Set(Object.keys(state.getState().books))
  expect(createBookIn(store, "s1", { title: "流れ" })).toBe(true)
  const book = Object.keys(state.getState().books).find(id => !before.has(id)) as string
  const pageOf = () => pagesOf(state.getState().books[book]!)[0]
  expect(
    actions.perform(
      "@matomezu/base:page-add",
      { type: "@matomezu/flowchart:flowchart", title: "p", grows: true },
      { book },
    ).ok,
  ).toBe(true)
  const page = pageOf()?.id as string
  expect(
    actions.perform("@matomezu/paper:item-place", { item: "@matomezu/box:shape-box", at: { x: 100, y: 100 } }, { page })
      .ok,
  ).toBe(true)
  // A4 縦は 794×1123
  expect(pageOf()?.shift).toEqual({ x: 1, y: 0 })
  expect(pageOf()?.items?.[0]).toMatchObject({ x: 894, y: 100 })
  expect(
    actions.perform(
      "@matomezu/base:page-update",
      { settings: { "@matomezu/flowchart:flow-direction": "right" } },
      { page },
    ).ok,
  ).toBe(true)
  expect(pageOf()?.shift).toEqual({ x: 0, y: 1 })
  expect(pageOf()?.items?.[0]).toMatchObject({ x: 100, y: 1223 })
})
