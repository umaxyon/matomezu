// スライドのブック: ページの slide にアイテムを置く・動かす・大きさを変える・項目を変える・比率を戻す・重ねを変える・消す（plugins/items/slide）
import { expect, test } from "bun:test"
import { BUILTIN } from "../../web/src/plugins"
import { createBookIn } from "../../web/src/plugins/base"
import { createMatomezu } from "../../web/src/store/create"
import { sequence } from "../support"

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

test("置いた物は書いたとおりの位置に残り、押し合わず、紙の外でもよい。置くときの比率を覚える", () => {
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
  expect((s.slide()[1] as { props: { ratio: number } }).props.ratio).toBe(2)
  // ブックの物（箱）は置けない
  expect(
    s.perform("@matomezu/paper:item-place", { page: s.page, item: "@matomezu/box:shape-box", at: { x: 0, y: 0 } }).ok,
  ).toBe(false)
})

test("大きさ: ロックすれば一方から他方を元の比率で決め、scale なら文字の大きさも変わる。比率は元に戻せる", () => {
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
  // ロックなし: 幅だけ変わる
  expect(s.perform("@matomezu/slide:slide-resize", { page: s.page, item: id, w: 300 }).ok).toBe(true)
  expect([box().w, box().h]).toEqual([300, 100])
  // 元の比率に戻す（幅は変えず高さを合わせる）
  expect(s.perform("@matomezu/slide:slide-reset-ratio", { page: s.page, item: id }).ok).toBe(true)
  expect([box().w, box().h]).toEqual([300, 150])
  // ロック: 高さだけ書いても幅が比率で決まる。scale で文字の大きさも倍率で変わる
  expect(s.perform("@matomezu/slide:slide-update", { page: s.page, item: id, props: { lockRatio: true } }).ok).toBe(
    true,
  )
  expect(s.perform("@matomezu/slide:slide-resize", { page: s.page, item: id, h: 300, scale: true }).ok).toBe(true)
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
