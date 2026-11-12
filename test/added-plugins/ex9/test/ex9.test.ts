// ex9（自分の対象の種類を足す）で、アクションがカード（レコード）を 1 件ずつ作る・直す・消し、番号は使い回さず、名前の重なりは断るのを確かめる
import { expect, test } from "bun:test"
import { BUILTIN, createMatomezu } from "matomezu/testing"
import EX9 from ".."

const make = () =>
  createMatomezu({
    plugins: [...BUILTIN, EX9],
    controlCenter: "@matomezu/control-center:control-center",
    lang: "ja",
  })

test("カードを作ると番号が 1 から振られ、名前が重なれば断り、消した番号は戻さない", () => {
  const instance = make()
  const { perform } = instance.actions
  const first = perform("ex9:card-add", { name: "りんご" })
  expect(first.ok && first.result).toMatchObject({ no: 1 })
  expect(perform("ex9:card-add", { name: "りんご" }).ok).toBe(false)
  const second = perform("ex9:card-add", { name: "みかん" })
  expect(second.ok && second.result).toMatchObject({ no: 2 })
  const cards = instance.state.getState().records["ex9:card"] ?? {}
  expect(Object.values(cards).map(c => (c as { name: string }).name)).toEqual(["りんご", "みかん"])

  const apple = first.ok ? (first.result as { card: string }).card : ""
  expect(perform("ex9:card-rename", { name: "みかん" }, { record: apple }).ok).toBe(false)
  expect(perform("ex9:card-rename", { name: "もも" }, { record: apple }).ok).toBe(true)
  expect(perform("ex9:card-remove", {}, { record: apple }).ok).toBe(true)
  const third = perform("ex9:card-add", { name: "ぶどう" })
  expect(third.ok && third.result).toMatchObject({ no: 3 })
  expect(perform("ex9:card-remove", {}, { record: "nothing" })).toEqual({ ok: false, reason: "no-record" })
})
