// ex13 のアクション: ボードごとに上限まで残し、別のボードのメモは消さない。済みにするのは 1 度だけ（索引キーの型の確かめは types.ts）
import { expect, test } from "bun:test"
import { BUILTIN, createMatomezu } from "matomezu/testing"
import EX13 from ".."

test("ボードに 100 件を超えて足すと古い物から消え、別のボードのメモは残る。済みにできるのは 1 度だけ", () => {
  const m = createMatomezu({
    plugins: [...BUILTIN, EX13],
    controlCenter: "@matomezu/control-center:control-center",
    lang: "ja",
  })
  const { perform } = m.actions
  for (let i = 0; i < 102; i++) expect(perform("ex13:memo-add", { board: "a", text: `t${i}` }).ok).toBe(true)
  perform("ex13:memo-add", { board: "b", text: "x" })
  const all = Object.values(m.state.getState().records["ex13:memo"] ?? {}) as {
    board: string
    order: number
    id: string
  }[]
  const a = all.filter(r => r.board === "a")
  expect(a.length).toBe(100)
  expect(Math.min(...a.map(r => r.order))).toBe(3)
  expect(all.filter(r => r.board === "b").length).toBe(1)
  expect(perform("ex13:memo-done", {}, { record: a[0]!.id }).ok).toBe(true)
  expect(perform("ex13:memo-done", {}, { record: a[0]!.id }).ok).toBe(false)
})
