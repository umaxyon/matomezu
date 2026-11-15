// スライドのブック: ページの slide にアイテムを置く・動かす・大きさを変える・項目を変える・重ねを変える・消す（plugins/items/slide）

import { expect, test } from "bun:test"
import { BUILTIN } from "../../web/src/plugins"
import { createBookIn } from "../../web/src/plugins/base"
import { createMatomezu } from "../../web/src/store/create"
import { pagesBook } from "../lineup"
import { newStore, sequence } from "../support"

const TEXT = "@matomezu/slide:slide-text"
const ELLIPSE = "@matomezu/slide:slide-ellipse"
const LINE = "@matomezu/slide:slide-line"
const FREE = "@matomezu/slide:slide-free-line"

function setup() {
  const instance = createMatomezu({
    plugins: BUILTIN,
    controlCenter: "@matomezu/control-center:control-center",
    newId: sequence(),
  })
  createBookIn(instance, "s1", { title: "スライド", type: "@matomezu/slide-book:slide" as never })
  const book = Object.keys(instance.state.getState().books).find(
    id => (instance.state.getState().books[id] as { type: string }).type === "@matomezu/slide-book:slide",
  ) as string
  const perform = (id: string, args: object) =>
    (
      instance.actions as unknown as {
        perform(id: string, a: object, on: { book: string }): { ok: boolean; result?: unknown }
      }
    ).perform(id, args, { book })
  expect(perform("@matomezu/base:page-add", { title: "1" }).ok).toBe(true)
  const slide = () =>
    (instance.state.getState().books[book] as unknown as { pages: { id: string; slide?: Record<string, unknown>[] }[] })
      .pages[0]
  const page = slide()?.id as string
  return { perform, page, slide: () => slide()?.slide ?? [] }
}

test("置いた物は書いたとおりの位置に残り、押し合わず、紙の外でもよい", () => {
  const s = setup()
  expect(
    s.perform("@matomezu/slide:slide-place", { page: s.page, item: TEXT, at: { x: 10, y: 20 }, props: { text: "a" } })
      .ok,
  ).toBe(true)
  // 重なる位置と、紙の外（負の位置）にも置け、先に置いた物は動かない
  expect(
    s.perform("@matomezu/slide:slide-place", {
      page: s.page,
      item: ELLIPSE,
      at: { x: 12, y: 22 },
      w: 200,
      h: 100,
      props: {},
    }).ok,
  ).toBe(true)
  expect(
    s.perform("@matomezu/slide:slide-place", { page: s.page, item: LINE, at: { x: -50, y: -50 }, props: {} }).ok,
  ).toBe(true)
  expect(s.slide().map(i => [i.item, i.x, i.y])).toEqual([
    [TEXT, 10, 20],
    [ELLIPSE, 12, 22],
    [LINE, -50, -50],
  ])
  // ブックの物（箱）は置けない
  expect(
    s.perform("@matomezu/paper:item-place", { page: s.page, item: "@matomezu/box:shape-box", at: { x: 0, y: 0 } }).ok,
  ).toBe(false)
})

test("大きさ: 書いた方だけ変わり、scale なら文字の大きさも幅の倍率で変わる。最小より小さくはできない", () => {
  const s = setup()
  s.perform("@matomezu/slide:slide-place", {
    page: s.page,
    item: TEXT,
    w: 200,
    h: 100,
    props: { text: "a", fontSize: 20 },
  })
  const id = s.slide()[0]?.id as string
  const prop = (k: string) => (s.slide()[0] as { props: Record<string, unknown> }).props[k]
  const box = () => s.slide()[0] as { w: number; h: number }
  // 幅だけ書けば、高さは今のまま
  expect(s.perform("@matomezu/slide:slide-resize", { page: s.page, item: id, w: 300 }).ok).toBe(true)
  expect([box().w, box().h]).toEqual([300, 100])
  // 幅と高さを書き、scale なら文字の大きさも幅の倍率で変わる
  expect(s.perform("@matomezu/slide:slide-resize", { page: s.page, item: id, w: 600, h: 300, scale: true }).ok).toBe(
    true,
  )
  expect([box().w, box().h]).toEqual([600, 300])
  expect(prop("fontSize")).toBe(40)
  // 最小より小さくはできない
  expect(s.perform("@matomezu/slide:slide-resize", { page: s.page, item: id, w: 1, h: 1 }).ok).toBe(false)
})

test("項目: 角度を書き、null で消せる。形に合わない項目は断る。動かす・重ねを変える・消す", () => {
  const s = setup()
  s.perform("@matomezu/slide:slide-place", {
    page: s.page,
    item: FREE,
    props: {
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    },
  })
  s.perform("@matomezu/slide:slide-place", { page: s.page, item: ELLIPSE, props: {} })
  const [a, b] = s.slide().map(i => i.id as string) as [string, string]
  expect(s.perform("@matomezu/slide:slide-update", { page: s.page, item: a, props: { rotation: 45 } }).ok).toBe(true)
  expect((s.slide()[0] as { props: { rotation?: number } }).props.rotation).toBe(45)
  expect(s.perform("@matomezu/slide:slide-update", { page: s.page, item: a, props: { rotation: null } }).ok).toBe(true)
  expect((s.slide()[0] as { props: { rotation?: number } }).props.rotation).toBeUndefined()
  expect(
    s.perform("@matomezu/slide:slide-update", { page: s.page, item: a, props: { points: [{ x: 2, y: 0 }] } }).ok,
  ).toBe(false)
  expect(s.perform("@matomezu/slide:slide-move", { page: s.page, item: a, at: { x: -5, y: 7 } }).ok).toBe(true)
  expect(s.perform("@matomezu/slide:slide-reorder", { page: s.page, item: a, to: "front" }).ok).toBe(true)
  expect(s.slide().map(i => i.id)).toEqual([b, a])
  expect(s.perform("@matomezu/slide:slide-remove", { page: s.page, item: b }).ok).toBe(true)
  expect(s.slide().map(i => i.id)).toEqual([a])
})

test("文字枠を置いて続けて打った文字は、置いた画面の履歴の段にまとまり、元に戻すは 1 回で文字枠ごと消える", async () => {
  const store = newStore({
    books: [
      pagesBook({
        type: "@matomezu/slide-book:slide",
        id: "b1",
        title: "スライド",
        pages: [{ id: "p1", title: "1", paper: "@matomezu/base:ratio-16x9", orientation: "landscape", slide: [] }],
      }),
    ] as never,
  })
  const state = () =>
    (store.state.getState().books.b1 as unknown as { pages: { slide: { id: string }[] }[] }).pages[0]!.slide
  const on = { book: "b1" }
  const put = store.actions.perform(
    "@matomezu/slide:slide-place",
    { page: "p1", item: TEXT, at: { x: 10, y: 10 }, props: { text: "" } },
    on,
  )
  expect(put.ok).toBe(true)
  await Promise.resolve()
  const id = state()[0]!.id
  store.actions.continueStep("b1")
  store.actions.perform("@matomezu/slide:slide-update", { page: "p1", item: id, props: { text: "書いた" } }, on)
  await Promise.resolve()
  expect(store.state.getState().history.b1?.undo).toHaveLength(1)
  store.actions.command("s1", "@matomezu/base:undo")
  expect(state()).toEqual([])
})

test("続けている画面の履歴の段には、コマンド（slide-set）が行うアクションも足され、元に戻すは 1 回で最初の値に戻る", async () => {
  const store = newStore({
    books: [
      pagesBook({
        type: "@matomezu/slide-book:slide",
        id: "b1",
        title: "スライド",
        pages: [{ id: "p1", title: "1", paper: "@matomezu/base:ratio-16x9", orientation: "landscape", slide: [] }],
      }),
    ] as never,
  })
  const slide = () =>
    (store.state.getState().books.b1 as unknown as { pages: { slide: { id: string; props: { width?: number } }[] }[] })
      .pages[0]!.slide
  const on = { book: "b1" }
  store.actions.perform(
    "@matomezu/slide:slide-place",
    {
      page: "p1",
      item: "@matomezu/slide:slide-ellipse",
      at: { x: 10, y: 10 },
      props: {},
    },
    on,
  )
  await Promise.resolve()
  const id = slide()[0]!.id
  store.actions.command("s1", "@matomezu/slide:slide-set", { items: [id], props: { width: 5 } })
  await Promise.resolve()
  store.actions.continueStep("b1")
  store.actions.command("s1", "@matomezu/slide:slide-set", { items: [id], props: { width: 6 } })
  await Promise.resolve()
  expect(slide()[0]?.props.width).toBe(6)
  expect(store.state.getState().history.b1?.undo).toHaveLength(2) // 置いた段と、太さの段（5 と 6 は 1 段）
  store.actions.command("s1", "@matomezu/base:undo")
  expect(slide()[0]?.props.width).toBeUndefined()
})

test("ロック中のページでは、スライドのアイテムを動かせず消せない（土台が slide のアイテムの id を変化に入れる）", () => {
  const s = setup()
  s.perform("@matomezu/slide:slide-place", { page: s.page, item: TEXT, at: { x: 10, y: 20 }, props: { text: "a" } })
  const item = s.slide()[0]?.id as string
  expect(s.perform("@matomezu/base:page-lock", { page: s.page }).ok).toBe(true)
  for (const [id, args] of [
    ["@matomezu/slide:slide-move", { page: s.page, item, at: { x: 0, y: 0 } }],
    ["@matomezu/slide:slide-remove", { page: s.page, item }],
  ] as const)
    expect(s.perform(id, args)).toMatchObject({ ok: false })
  expect(s.slide()).toHaveLength(1)
  expect(s.perform("@matomezu/base:page-unlock", { page: s.page }).ok).toBe(true)
  expect(s.perform("@matomezu/slide:slide-move", { page: s.page, item, at: { x: 0, y: 0 } }).ok).toBe(true)
})
