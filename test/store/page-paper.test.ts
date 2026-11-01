// ページの紙・向き・伸びるか: page-add で決め、page-update であとから変える（plugins/base/page-tabs）
import { expect, test } from "bun:test"
import { z } from "zod"
import { defineBookType } from "../../web/src/core/def/book-type"
import type { BookOf } from "../../web/src/core/schema/book"
import { BUILTIN } from "../../web/src/plugins"
import { createBookIn } from "../../web/src/plugins/base"
import { DRAWING } from "../../web/src/plugins/books/drawing/drawing"
import { createMatomezu } from "../../web/src/store/create"
import { definePlugin } from "../../web/src/store/plugin"
import { newStore, sequence } from "../support"

type Drawing = BookOf<"@matomezu/drawing:drawing">

test("紙と向きはあとから変えられ、形が紙からはみ出す変更は断る。図面のページは可変ページにでき、そうすれば紙の外へ広がってよい", () => {
  const { state, actions } = newStore()
  const pages = () => (state.getState().books.b1 as Drawing).pages
  expect(actions.perform("@matomezu/base:page-add", { title: "p", orientation: "landscape" }, { book: "b1" }).ok).toBe(
    true,
  )
  const page = pages().at(-1)?.id as string
  const update = (args: object) => actions.perform("@matomezu/base:page-update", { page, ...args }, { book: "b1" }).ok
  expect(
    actions.perform(
      "@matomezu/paper:item-place",
      { page, item: "@matomezu/box:shape-nest-box", at: { x: 900, y: 100 } },
      { book: "b1" },
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
  // 図面のページは可変ページにでき、そうすれば右と下へ広がるので、A5 にも入る
  expect(update({ grows: true })).toBe(true)
  expect(update({ paper: "@matomezu/base:a5" })).toBe(true)
  expect(pages().at(-1)).toMatchObject({ paper: "@matomezu/base:a5", grows: true })
})

// 伸びられるタイプの見本（core/catalog.ts には書き足さないので、インスタンスは partial で作る）
const SHEET = defineBookType({
  id: "notes:sheet",
  version: 1,
  title: "@matomezu/drawing:Drawing",
  schema: z.strictObject({ type: z.literal("notes:sheet"), id: z.string().min(1) }),
  single: false,
  create: init => ({ type: "notes:sheet" as const, ...init, pages: [] }),
  pages: {
    paper: {
      allowed: ["@matomezu/base:a4", "@matomezu/base:a3"],
      default: "@matomezu/base:a4",
      orientation: "portrait",
      perPage: false,
      grow: "both",
    },
  },
  items: { allowed: [], defaults: [] },
  actions: {},
  theme: "@matomezu/base:standard",
  presentation: "@matomezu/master:master", // 画面に出さないので、見せ方は表にあるものを借りる
  tokens: [],
})

test("伸びられるタイプのページは、作るときもあとからも可変ページにでき、grows は向きの次に並ぶ。1 冊の紙をそろえる規定では、ほかのページがあれば紙を変えられない", () => {
  const ids = ["n1", "n2", "n3"]
  const instance = createMatomezu({
    plugins: [...BUILTIN, definePlugin({ id: "notes", bookTypes: [SHEET] })],
    partial: true,
    home: "@matomezu/master:master",
    newId: () => ids.shift() ?? "nx",
  })
  const perform = instance.actions.perform as (id: string, args: unknown, on: unknown) => { ok: boolean }
  const pages = () => (instance.state.getState().books.n1 as unknown as { pages: Record<string, unknown>[] }).pages
  expect(createBookIn(instance, "s1", { title: "表", type: "notes:sheet" as never })).toBe(true)
  expect(perform("@matomezu/base:page-add", { title: "p", grows: true }, { book: "n1" }).ok).toBe(true)
  expect(Object.keys(pages()[0] ?? {})).toEqual(["id", "title", "paper", "orientation", "grows"])
  expect(perform("@matomezu/base:page-update", { page: "n2", grows: false }, { book: "n1" }).ok).toBe(true)
  expect("grows" in (pages()[0] ?? {})).toBe(false)
  // ページが 1 枚なら、紙をそろえる規定でも変えられる
  expect(perform("@matomezu/base:page-update", { page: "n2", paper: "@matomezu/base:a3" }, { book: "n1" }).ok).toBe(
    true,
  )
  expect(perform("@matomezu/base:page-add", { title: "q" }, { book: "n1" }).ok).toBe(true)
  expect(pages()[1]).toMatchObject({ paper: "@matomezu/base:a3" })
  expect(perform("@matomezu/base:page-update", { page: "n2", paper: "@matomezu/base:a4" }, { book: "n1" }).ok).toBe(
    false,
  )
})

// 下へだけ伸びられる、形を置くタイプの見本（図面のブックのタイプを借りる）
const SCROLL = defineBookType({
  ...DRAWING,
  id: "notes:scroll",
  schema: z.strictObject({ type: z.literal("notes:scroll"), id: z.string().min(1) }),
  create: init => ({ type: "notes:scroll" as const, ...init, pages: [] }),
  pages: { paper: { ...DRAWING.pages.paper, grow: "down" } },
})

test("可変ページは、伸びない向き（下へだけ伸びるなら横）だけ紙 1 枚に収まればよい。伸びるのをやめるのは、形が紙 1 枚に入るときだけ", () => {
  const instance = createMatomezu({
    plugins: [...BUILTIN, definePlugin({ id: "notes", bookTypes: [SCROLL] })],
    partial: true,
    home: "@matomezu/master:master",
    newId: sequence(),
  })
  const perform = instance.actions.perform as (id: string, args: unknown, on: unknown) => { ok: boolean }
  expect(createBookIn(instance, "s1", { title: "巻物", type: "notes:scroll" as never })).toBe(true)
  const book = Object.keys(instance.state.getState().books).find(id => id !== "@matomezu/master:master") as string
  const pages = () => (instance.state.getState().books[book] as unknown as { pages: { id: string }[] }).pages
  expect(perform("@matomezu/base:page-add", { title: "p", orientation: "portrait", grows: true }, { book }).ok).toBe(
    true,
  )
  const page = pages()[0]?.id as string
  const place = (x: number, y: number) =>
    perform("@matomezu/paper:item-place", { page, item: "@matomezu/box:shape-nest-box", at: { x, y } }, { book }).ok
  const update = (args: object) => perform("@matomezu/base:page-update", { page, ...args }, { book }).ok
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
  const pages = () => (state.getState().books.b1 as Drawing).pages
  expect(actions.perform("@matomezu/base:page-add", { title: "p", orientation: "landscape" }, { book: "b1" }).ok).toBe(
    true,
  )
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
        { page, item: "@matomezu/box:shape-nest-box", at: { x, y } },
        { book: "b1" },
      ) as { ok: boolean; result?: { item: string } }
    ).result?.item
  const first = place(100, 100) as string
  // 可変ページにすると、左と上に空きの印刷区画を 1 つずつ持つよう中身が 印刷区画 1 つ分ずつずれる（A4 横は 1123×794）
  expect(actions.perform("@matomezu/base:page-update", { page, grows: true }, { book: "b1" }).ok).toBe(true)
  expect(at().shift).toEqual({ x: 1, y: 1 })
  expect(at().items.find(i => i.id === first)).toMatchObject({ x: 1223, y: 894 })
  // 左の空きの印刷区画へ置くと、全体が印刷区画 1 つ分右へずれる
  const left = place(50, 900) as string
  expect(at().shift).toEqual({ x: 2, y: 1 })
  expect(at().items.find(i => i.id === left)).toMatchObject({ x: 1173, y: 900 })
  expect(at().items.find(i => i.id === first)).toMatchObject({ x: 2346, y: 894 })
  // 左の箱を消すと、空いた左端の印刷区画を詰める
  expect(actions.perform("@matomezu/paper:item-remove", { page, items: [left] }, { book: "b1" }).ok).toBe(true)
  expect(at().shift).toEqual({ x: 1, y: 1 })
  expect(at().items.find(i => i.id === first)).toMatchObject({ x: 1223, y: 894 })
  // 可変ページをやめると、空きを詰めて紙 1 枚に戻す
  expect(actions.perform("@matomezu/base:page-update", { page, grows: false }, { book: "b1" }).ok).toBe(true)
  expect(at().shift).toBeUndefined()
  expect(at().items.find(i => i.id === first)).toMatchObject({ x: 100, y: 100 })
})
