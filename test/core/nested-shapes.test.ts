// 子の形（能力 nests の形が持つ shapes）: ブックの形が受け付ける子と、子までたどる・探す関数（core/placed.ts）・置き換える関数（base の place/items.ts）・子を持つ形の大きさ（base の place/placed.ts）
import { describe, expect, test } from "bun:test"
import { pagedOf, restoreBooks } from "../../web/src/core/book"
import { findShape, type ItemPage, type PlacedShape, walkShapes } from "../../web/src/core/placed"
import { replaceShape } from "../../web/src/plugins/base/place/items"
import { NEST_PADDING, placedSize } from "../../web/src/plugins/base/place/placed"
import { CORE_CATALOG } from "../support"

const BOX = "@matomezu/box:shape-nest-box"
const LIST = "@matomezu/list:shape-list"
const LINE = "@matomezu/line:connector-line"

// 図面のブックは内包ボックス（能力 nests）・リスト・線を使う
const nesting = CORE_CATALOG

const book = (items: unknown[]) => ({
  type: "@matomezu/drawing:drawing",
  id: "b1",
  title: "T",
  pages: [{ id: "p1", title: "P", paper: "@matomezu/base:a4", orientation: "landscape", items }],
})
const box = (id: string, x: number, y: number, shapes?: unknown[]) => ({
  id,
  x,
  y,
  item: BOX,
  props: {},
  ...(shapes ? { shapes } : {}),
})
const list = (id: string) => ({ id, x: 0, y: 0, item: LIST, props: {} })
const line = (id: string, from: string, to: string) => ({ id, item: LINE, from, to, props: {} })
const reads = (items: unknown[]) => restoreBooks(nesting, [book(items)]).length === 1

describe("子の形を受け付けるブックの形", () => {
  test("能力 nests の形は、ブックで使える形を何段でも子に持てる", () => {
    expect(reads([box("a", 10, 10, [box("b", 5, 5, [list("c")])]), line("l1", "a", "c")])).toBe(true)
  })

  test("能力 nests の無い形は子を持てない", () => {
    expect(reads([{ ...list("a"), shapes: [box("b", 0, 0)] }])).toBe(false)
  })

  test("子に線は入らない。空の子の並びは持たない", () => {
    expect(reads([box("a", 0, 0, [box("b", 0, 0), box("c", 0, 0), line("l1", "b", "c")])])).toBe(false)
    expect(reads([box("a", 0, 0, [])])).toBe(false)
  })

  test("子の形もその形の項目で確かめる。機能台帳に無い形は、子でもそのまま残す", () => {
    expect(reads([box("a", 0, 0, [{ ...box("b", 0, 0), props: { caption: 1 } }])])).toBe(false)
    const stray = { id: "s", x: 1, y: 2, item: "@foo/stars:star", props: { n: 5 } }
    const [restored] = restoreBooks(nesting, [book([box("a", 0, 0, [stray])])])
    expect((pagedOf(restored)?.pages[0] as ItemPage | undefined)?.items?.[0]).toMatchObject({ shapes: [stray] })
  })
})

describe("子までたどる・探す・置き換える", () => {
  const page = {
    id: "p1",
    title: "P",
    paper: "@matomezu/base:a4",
    items: [
      box("a", 100, 50, [box("b", 10, 20, [box("c", 1, 2)]), box("d", 40, 0)]),
      box("e", 300, 0),
      line("l1", "c", "e"),
    ],
  } as unknown as ItemPage

  test("親の次にその子孫の順で、親の id と紙の上の左上を付ける", () => {
    expect(walkShapes(page).map(s => [s.shape.id, s.parent, s.at.x, s.at.y])).toEqual([
      ["a", null, 100, 50],
      ["b", "a", 110, 70],
      ["c", "b", 111, 72],
      ["d", "a", 140, 50],
      ["e", null, 300, 0],
    ])
  })

  test("どの深さの形も id で探せる。線や無い id は見つからない", () => {
    expect(findShape(page, "c")).toMatchObject({ parent: "b", at: { x: 111, y: 72 } })
    expect(findShape(page, "l1")).toBeUndefined()
    expect(findShape(page, "z")).toBeUndefined()
  })

  test("深い形を置き換えると、その親たちだけを作り直す（ほかの形と線はそのまま）", () => {
    const next = replaceShape(page, "c", s => ({ ...s, x: 9 }))!
    expect(findShape(next, "c")?.at).toEqual({ x: 119, y: 72 })
    expect(next.items?.[1]).toBe(page.items?.[1])
    expect(next.items?.[2]).toBe(page.items?.[2])
  })

  test("null を返すと子孫ごと除く。子が無くなった親は shapes を持たない。無い id なら null", () => {
    const next = replaceShape(page, "b", () => null)!
    expect(walkShapes(next).map(s => s.shape.id)).toEqual(["a", "d", "e"])
    const empty = replaceShape(next, "d", () => null)!
    expect(empty.items?.[0]).not.toHaveProperty("shapes")
    expect(replaceShape(page, "z", s => s)).toBeNull()
    expect(replaceShape(page, "l1", s => s)).toBeNull()
  })
})

describe("子の形を持つ形の大きさ", () => {
  test("自分の大きさ（w・h は下限）と、子がみな入る大きさ（子の右と下の端から NEST_PADDING）の大きい方", () => {
    const size = (shapes?: unknown[]) =>
      placedSize(CORE_CATALOG, { ...box("a", 0, 0, shapes), w: 200, h: 100 } as unknown as PlacedShape)
    const child = (x: number, y: number) => ({ ...box("b", x, y), w: 120, h: 60 })
    expect(size()).toEqual({ w: 200, h: 100 })
    expect(size([child(10, 10)])).toEqual({ w: 200, h: 100 })
    expect(size([child(100, 80)])).toEqual({ w: 220 + NEST_PADDING, h: 140 + NEST_PADDING })
    expect(size([{ ...child(100, 80), shapes: [{ ...box("c", 150, 0), w: 50, h: 10 }] }])).toEqual({
      w: 300 + NEST_PADDING * 2,
      h: 140 + NEST_PADDING,
    })
  })
})
