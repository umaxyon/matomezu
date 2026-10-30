// ex6 と ex7 で、定義オブジェクトの拡張ポイントを確かめる: ex6-spec が形の拡張ポイントに書き足したメソッド "ex6:weight" に ex7 の木箱が答え、
// ex6 のアクションが機能台帳から引いて使う。ex6 と ex7 を一緒に組むので、このテストだけは ex6 のコード（ex6/ui）を読む
import { expect, test } from "bun:test"
import { act } from "@testing-library/react"
import EX6_UI from "ex6/ui"
import { addPageIn, createBookIn } from "matomezu"
import { BUILTIN_UI, createMatomezu } from "matomezu/testing"
import EX7_UI from "../ui"

test("ex6 のページの重さは、ex7 の木箱が ex6:weight で答えた重さを足し合わせる", () => {
  const instance = createMatomezu({
    plugins: [...BUILTIN_UI, EX6_UI, EX7_UI],
    home: "@matomezu/master:master",
    lang: "ja",
  })
  act(() => {
    expect(createBookIn(instance, "s1", { title: "置き場", type: "ex7:yard" })).toBe(true)
  })
  const book = (instance.state.getState().workspace.stages[0]!.opened as { book: string }).book
  act(() => {
    expect(addPageIn(instance, "s1", { title: "p1" })).toBe(true)
  })
  const on = { book }
  const page = (instance.state.getState().books[book] as unknown as { pages: readonly { id: string }[] }).pages[0]!.id
  act(() => {
    for (const [x, load] of [
      [40, 3],
      [200, 4],
    ] as const)
      expect(
        instance.actions.perform(
          "@matomezu/paper:item-place",
          { page, item: "ex7:crate", at: { x, y: 40 }, props: { load } },
          on,
        ),
      ).toMatchObject({ ok: true })
  })
  expect(instance.actions.perform("ex6:page-weight", { page }, on)).toMatchObject({ ok: true, result: { weight: 7 } })
})
