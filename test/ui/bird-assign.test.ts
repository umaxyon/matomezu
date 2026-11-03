// 付ける先の鳥の割り当て（assignBirds）: 残った物は同じ鳥、外れた物の鳥は足された物へ移り、余れば飛び去り、足りなければ出ていない鳥から選ぶ
import { expect, test } from "bun:test"
import { BIRD_IDS } from "../../web/src/plugins/base/birds"
import { assignBirds } from "../../web/src/plugins/base/birds/assign"

const first = () => 0

test("足りない鳥は、出ていない鳥から選ぶ（5 羽とも出ていれば、かぶってよい）", () => {
  const five = assignBirds({}, ["a", "b", "c", "d", "e"], first)
  expect(new Set(Object.values(five.birds)).size).toBe(5)
  const six = assignBirds(five.birds, ["a", "b", "c", "d", "e", "f"], first)
  expect(BIRD_IDS).toContain(six.birds.f!)
  expect(six.moved).toEqual({})
  expect(six.left).toEqual([])
})

test("残った物は同じ鳥のまま。外れた物の鳥は足された物へ移り、余った鳥は飛び去る", () => {
  const { birds } = assignBirds({}, ["a", "b"], first)
  const swapped = assignBirds(birds, ["a", "c"], first)
  expect(swapped.birds).toEqual({ a: birds.a!, c: birds.b! })
  expect(swapped.moved).toEqual({ c: "b" })
  expect(swapped.left).toEqual([])
  const fewer = assignBirds(swapped.birds, ["c"], first)
  expect(fewer.birds).toEqual({ c: birds.b! })
  expect(fewer.left).toEqual([{ anchor: "a", bird: birds.a! }])
  expect(assignBirds(fewer.birds, [], first).left).toEqual([{ anchor: "c", bird: birds.b! }])
})
