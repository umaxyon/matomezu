// 書庫が対象のアクション（ここでは、戻す・やり直すの置き直し history-revert）のあとの確かめ: 行う前から在って変わったブックにノーマライズステップをかけ、
// ページのタイプは作ったあと変えさせない
import { expect, test } from "bun:test"
import { pagesOf } from "../../web/src/core/book"
import type { Book } from "../../web/src/core/schema/book"
import { newStore } from "../support"

const REVERT = "@matomezu/base:history-revert"

function ready() {
  const { state, actions } = newStore()
  const book = () => state.getState().books.b1 as Book
  expect(
    actions.perform(
      "@matomezu/base:page-add",
      { type: "@matomezu/drawing:drawing", title: "p", orientation: "landscape" },
      { book: "b1" },
    ).ok,
  ).toBe(true)
  const page = pagesOf(book()).at(-1)?.id as string
  const at = () =>
    pagesOf(book()).find(p => p.id === page) as unknown as {
      type: string
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
    ).result?.item as string
  return { state, actions, page, at, place }
}

test("一覧が対象のアクションのあとにも、ノーマライズステップがかかる（可変ページの左端の印刷区画が空けば詰める）。変わらなかったブックは同じ値のまま", () => {
  const { state, actions, page, at, place } = ready()
  const first = place(100, 100)
  expect(actions.perform("@matomezu/base:page-update", { grows: "all" }, { page }).ok).toBe(true)
  const left = place(50, 900)
  expect(at().shift).toEqual({ x: 2, y: 1 })
  const others = Object.values(state.getState().books).filter(b => b.id !== "b1")
  // 左の箱を無くす置き直し（ずらした量 shift は置き直さない。ノーマライズステップが詰める）
  const was = at().items.find(i => i.id === left)
  const pages = { [page]: { fields: { items: { list: [{ id: left, index: 1, patch: { absent: true, was } }] } } } }
  expect(actions.perform(REVERT, { outermosts: [{ kind: "book", id: "b1" }], pages, folders: {} }).ok).toBe(true)
  expect(at().shift).toEqual({ x: 1, y: 1 })
  expect(at().items.find(i => i.id === first)).toMatchObject({ x: 1223, y: 894 })
  for (const b of others) expect(state.getState().books[b.id]).toBe(b)
})

test("一覧が対象のアクションでも、ページのタイプは作ったあと変えられない（refused）", () => {
  const { actions, page, at } = ready()
  const pages = { [page]: { fields: { type: { set: "@matomezu/flowchart:flowchart", was: at().type } } } }
  expect(actions.perform(REVERT, { outermosts: [{ kind: "book", id: "b1" }], pages, folders: {} })).toEqual({
    ok: false,
    reason: "refused",
  })
  expect(at().type).toBe("@matomezu/drawing:drawing")
})
