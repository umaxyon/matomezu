import { expect, test } from "bun:test"
import { inOrder, type KeyValues, keyValuesOf, matches, unknownKey } from "../../web/src/core/record-keys"

const def = {
  keys: {
    board: { type: "text" as const, of: (m: { board: string }) => m.board },
    order: { type: "number" as const, of: (m: { order: number }) => m.order },
    doneAt: { type: "text" as const, of: (m: { doneAt?: string }) => m.doneAt },
  },
}

test("索引キーの値は宣言した型の値だけを持ち、値の無いキーは持たない", () => {
  expect(keyValuesOf(def, { board: "a", order: 3 })).toEqual({ board: "a", order: 3 })
  expect(keyValuesOf(def, { board: 1, order: "x", doneAt: "t" })).toEqual({ doneAt: "t" })
  expect(keyValuesOf(def, null)).toEqual({})
  expect(keyValuesOf({}, { board: "a" })).toEqual({})
})

test("条件は全部に合うときだけ合う", () => {
  const v = { board: "a", order: 3 }
  expect(matches(v, [])).toBe(true)
  expect(matches(v, [{ key: "board", eq: "a" }])).toBe(true)
  expect(matches(v, [{ key: "board", eq: "b" }])).toBe(false)
  expect(
    matches(v, [
      { key: "order", lt: 4 },
      { key: "order", gt: 2 },
    ]),
  ).toBe(true)
  expect(matches(v, [{ key: "order", lt: 3 }])).toBe(false)
  expect(matches(v, [{ key: "doneAt", is: "absent" }])).toBe(true)
  expect(matches(v, [{ key: "doneAt", is: "present" }])).toBe(false)
  expect(matches(v, [{ key: "doneAt", eq: "t" }])).toBe(false)
  expect(matches(v, [{ key: "order", lt: "9" }])).toBe(false)
})

test("並びはキーの値の順で、同じ値と値の無い行は id の順（値の無い行は後ろ）", () => {
  const rows: { id: string; keys: KeyValues }[] = [
    { id: "c", keys: { order: 1 } },
    { id: "a", keys: { order: 2 } },
    { id: "b", keys: { order: 2 } },
    { id: "e", keys: {} },
    { id: "d", keys: {} },
  ]
  expect(inOrder(rows, { key: "order", dir: "asc" }).map(r => r.id)).toEqual(["c", "a", "b", "d", "e"])
  expect(inOrder(rows, { key: "order", dir: "desc" }).map(r => r.id)).toEqual(["a", "b", "c", "d", "e"])
  expect(inOrder(rows).map(r => r.id)).toEqual(["a", "b", "c", "d", "e"])
})

test("宣言に無いキーと、型の違う値を見つける", () => {
  expect(unknownKey(def, [{ key: "board", eq: "a" }], { key: "order", dir: "asc" })).toBeNull()
  expect(unknownKey(def, [{ key: "text", eq: "a" }])).toBe("text")
  expect(unknownKey(def, [{ key: "order", eq: "1" }])).toBe("order")
  expect(unknownKey(def, [], { key: "x", dir: "asc" })).toBe("x")
})
