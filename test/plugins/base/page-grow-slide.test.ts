// 可変ページの中身のずらし（base の place/items の alignPadding）: 左・上へ増やすとき、ページの slide の形も、中身（items）と同じ量でずれる
import { expect, test } from "bun:test"
import type { Book } from "../../../web/src/core/schema/book"
import { paperSize } from "../../../web/src/plugins/base/place/items"
import { ELLIPSE } from "../../../web/src/plugins/items/slide/slide"
import { CORE_CATALOG, newStore } from "../../support"

type Drawing = Book

test("左・上へ増やす可変ページにすると、slide の形も中身と同じ印刷区画の分ずれ、可変ページをやめると戻る", () => {
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
      slide: { id: string; x: number; y: number; w: number; h: number }[]
    }
  expect(
    actions.perform(
      "@matomezu/paper:item-place",
      { page, item: "@matomezu/box:shape-nest-box", at: { x: 100, y: 100 } },
      { book: "b1" },
    ).ok,
  ).toBe(true)
  const done = actions.perform(
    "@matomezu/slide:slide-place",
    { page, item: ELLIPSE.id, at: { x: 300, y: 200 } },
    { book: "b1" },
  ) as { ok: boolean; result?: { item: string } }
  expect(done.ok).toBe(true)
  const ellipse = done.result?.item as string
  const size = { w: at().slide[0]?.w, h: at().slide[0]?.h }
  const paper = paperSize(CORE_CATALOG, at() as never) as { w: number; h: number }
  // 可変ページにすると、中身が 印刷区画 1 つ分ずつ（紙の大きさの分）ずれ、slide の形も同じだけずれる
  expect(actions.perform("@matomezu/base:page-update", { page, grows: "all" }, { book: "b1" }).ok).toBe(true)
  expect(at().shift).toEqual({ x: 1, y: 1 })
  expect(at().items[0]).toMatchObject({ x: 100 + paper.w, y: 100 + paper.h })
  expect(at().slide.find(s => s.id === ellipse)).toMatchObject({ x: 300 + paper.w, y: 200 + paper.h, ...size })
  // 可変ページをやめると、空きを詰めて、slide の形も元の位置に戻る
  expect(actions.perform("@matomezu/base:page-update", { page, grows: false }, { book: "b1" }).ok).toBe(true)
  expect(at().shift).toBeUndefined()
  expect(at().slide.find(s => s.id === ellipse)).toMatchObject({ x: 300, y: 200 })
})
