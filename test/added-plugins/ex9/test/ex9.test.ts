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

test("閉じた棚にカードを足せない。棚が無ければ足せず（reads に無い参照は引けない）、開いている棚には足せる。カードを足すのは棚を引数で指す形でも、守るのは行った後の参照", () => {
  const instance = make()
  const { perform } = instance.actions
  const shelf = perform("ex9:shelf-add", { name: "本棚" })
  const id = shelf.ok ? (shelf.result as { shelf: string }).shelf : ""
  expect(perform("ex9:card-add", { name: "a", shelf: id }).ok).toBe(true)
  expect(perform("ex9:shelf-close", {}, { record: id }).ok).toBe(true)
  expect(perform("ex9:card-add", { name: "b", shelf: id })).toMatchObject({
    ok: false,
    reason: "denied",
    permission: "ex9:closed-shelf",
  })
  // 閉じた棚のカードも、直す・消すことはできる（止めるのは足すときだけ）
  const cards = Object.values(instance.state.getState().records["ex9:card"] ?? {}) as { id: string }[]
  expect(perform("ex9:card-rename", { name: "z" }, { record: cards[0]!.id }).ok).toBe(true)
  // 棚を指さないカードは、いつでも足せる
  expect(perform("ex9:card-add", { name: "c" }).ok).toBe(true)
})

test("ロックしたカードは、ロックを外すほかは変えず消さない。ロックを外せるのは利用者だけ", () => {
  const instance = make()
  const { perform } = instance.actions
  const made = perform("ex9:card-add", { name: "a" })
  const id = made.ok ? (made.result as { card: string }).card : ""
  expect(perform("ex9:card-lock", {}, { record: id }).ok).toBe(true)
  const locked = { record: id }
  expect(perform("ex9:card-rename", { name: "b" }, locked)).toMatchObject({
    ok: false,
    reason: "denied",
    permission: "@matomezu/base:lock",
  })
  expect(perform("ex9:card-remove", {}, locked)).toMatchObject({
    ok: false,
    reason: "denied",
    permission: "@matomezu/base:lock",
  })
  // 利用者はロックを外せる。外すと直せる
  expect(perform("ex9:card-unlock", {}, locked).ok).toBe(true)
  expect(perform("ex9:card-rename", { name: "b" }, locked).ok).toBe(true)
})
