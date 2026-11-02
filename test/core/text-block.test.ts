// 文字の塊（base の text/block.ts）: キャプション 1 行・区切り線・本文を上から並べ、中の幅と高さに収める
import { expect, test } from "bun:test"
import {
  blockBodyHeight,
  blockBodyLines,
  bodyColumn,
  bodyMinWidth,
  bodySides,
  bodyWidthAfter,
  textBlock,
  textBlockHeight,
} from "../../web/src/plugins/base/text/block"
import { TEXT_LOOK as L } from "../../web/src/plugins/base/text/fields"
import { plainOf } from "../../web/src/plugins/base/text/rich"
import { textWidth } from "../../web/src/plugins/base/text/text"

const INNER = 144 // 中の幅
const LEAST = 50 // 本文の列の一番狭い幅
const ALIGNS = { captionAlign: "center", bodyAlign: "left" } as const
const block = (body: string, rule = true) => ({ caption: "見出し", rule, body, ...ALIGNS })
const RULE = 2 * L.ruleGap + 1
// 本文を n 行出す塊の高さ（キャプション・区切り線・本文）
const heightOf = (n: number, rule = true) => L.line + (n > 0 && rule ? RULE : 0) + n * L.line
const LONG = "あ".repeat(100)

test("区切り線と本文の高さは本文の行数で決まり、本文が 0 行なら区切り線も無い。高さから一番近い行数に戻せる", () => {
  expect(blockBodyHeight(0, true)).toBe(0)
  expect(blockBodyHeight(3, true)).toBe(RULE + 3 * L.line)
  expect(blockBodyHeight(3, false)).toBe(3 * L.line)
  for (const n of [0, 1, 5]) expect(blockBodyLines(blockBodyHeight(n, true), true)).toBe(n)
  expect(blockBodyLines(RULE / 2 - 1, true)).toBe(0)
  expect(blockBodyLines(RULE + 2 * L.line + L.line / 3, true)).toBe(2)
})

test("本文は高さに収まる行の数だけ出し、収まらない分は最後の行の終わりに … を付けて切る", () => {
  const all = textBlock(block(LONG), INNER, LEAST, 2000)
  expect(all.body.map(plainOf).join("")).toBe(LONG)
  expect(all.height).toBe(textBlockHeight(block(LONG), INNER, LEAST))
  const three = textBlock(block(LONG), INNER, LEAST, heightOf(3))
  expect(three.body).toHaveLength(3)
  expect(three.height).toBe(heightOf(3))
  expect(plainOf(three.body[2]!)).toMatch(/…$/)
  expect(textBlock(block(LONG), INNER, LEAST, heightOf(3) + 17).body).toHaveLength(3)
  expect(textBlock(block("一\n二"), INNER, LEAST, heightOf(3)).body.map(plainOf)).toEqual(["一", "二"])
  expect(textBlockHeight(block(LONG), INNER, LEAST, 5)).toBe(heightOf(5))
})

test("本文が 1 行も出ない高さなら、区切り線も出さない。本文が無ければキャプション 1 行の高さ", () => {
  expect(textBlock(block(LONG), INNER, LEAST, heightOf(1) - 1)).toMatchObject({ body: [], rule: false, height: L.line })
  expect(textBlock(block(LONG), INNER, LEAST, heightOf(1))).toMatchObject({ rule: true })
  expect(textBlock(block(LONG, false), INNER, LEAST, heightOf(1, false)).body).toHaveLength(1)
  expect(textBlockHeight(block(""), INNER, LEAST)).toBe(L.line)
})

test("本文の幅を書けば、その幅の列で折り返す。列はキャプションの寄せに倣い、キャプションの幅と一番狭い幅より狭くも、中より広くもならない", () => {
  const at = (captionAlign: "left" | "center" | "right", bodyWidth?: number) =>
    bodyColumn({ ...block(LONG), captionAlign, bodyWidth }, INNER, LEAST)
  expect(at("center")).toEqual({ x: 0, w: INNER })
  expect(at("left", 80)).toEqual({ x: 0, w: 80 })
  expect(at("center", 80)).toEqual({ x: (INNER - 80) / 2, w: 80 })
  expect(at("right", 80)).toEqual({ x: INNER - 80, w: 80 })
  expect(at("left", 999).w).toBe(INNER)
  expect(at("left", 1).w).toBe(bodyMinWidth(block(LONG), LEAST))
  expect(bodyMinWidth({ ...block(LONG), caption: "" }, LEAST)).toBe(LEAST)
  expect(bodyMinWidth({ ...block(LONG), caption: "とても長いキャプションです" }, LEAST)).toBe(
    Math.ceil(textWidth("とても長いキャプションです", L.caption)),
  )
  const wide = textBlock(block(LONG), INNER, LEAST, 2000).body.length
  expect(textBlock({ ...block(LONG), bodyWidth: 80 }, INNER, LEAST, 2000).body.length).toBeGreaterThan(wide)
})

test("本文の列の端を動かすと、中央寄せは両側が同じだけ、左寄せは右の端、右寄せは左の端だけが動く。中いっぱいなら幅を消す", () => {
  const of = (captionAlign: "left" | "center" | "right") => ({ ...block(LONG), captionAlign })
  expect(bodySides(of("center"))).toEqual(["left", "right"])
  expect(bodySides(of("left"))).toEqual(["right"])
  expect(bodySides(of("right"))).toEqual(["left"])
  expect(bodyWidthAfter(of("center"), INNER, LEAST, "right", -10)).toBe(INNER - 20)
  expect(bodyWidthAfter(of("center"), INNER, LEAST, "left", 10)).toBe(INNER - 20)
  expect(bodyWidthAfter(of("left"), INNER, LEAST, "right", -10)).toBe(INNER - 10)
  expect(bodyWidthAfter(of("right"), INNER, LEAST, "left", 10)).toBe(INNER - 10)
  expect(bodyWidthAfter(of("left"), INNER, LEAST, "right", -999)).toBe(bodyMinWidth(of("left"), LEAST))
  expect(bodyWidthAfter({ ...of("left"), bodyWidth: 80 }, INNER, LEAST, "right", 999)).toBeNull()
})
