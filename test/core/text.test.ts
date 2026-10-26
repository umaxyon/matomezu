import { expect, test } from "bun:test"
import { clampLines, type Font, textWidth, wrap } from "../../web/src/plugins/base/text/text"

const F: Font = { size: 10, weight: 400 }
const B: Font = { size: 10, weight: 700 }
// 全角の字 n 字ぶんの幅（Noto Sans JP の和文は 1 em）
const em = (n: number) => n * 10

test("幅はフォントの表から出す。和文は 1 em、英字は字ごとの幅で、太字は太字の表を使う", () => {
  expect(textWidth("あいう", F)).toBe(em(3))
  expect(textWidth("漢字", F)).toBe(em(2))
  expect(textWidth("i", F)).toBeLessThan(textWidth("W", F))
  expect(textWidth("Matomezu", B)).toBeGreaterThan(textWidth("Matomezu", F))
  expect(textWidth("", F)).toBe(0)
})

test("表に無い字は、全角の範囲なら 1 em、ほかは半分の幅", () => {
  expect(textWidth("\u{10FFFD}", F)).toBe(em(1))
  expect(textWidth("͸", F)).toBe(em(0.5))
})

test("和文は字の間で折り返し、改行はそのまま行を分ける", () => {
  expect(wrap("あいうえおかきくけこ", em(4), F)).toEqual(["あいうえ", "おかきく", "けこ"])
  expect(wrap("あい\nうえ", em(10), F)).toEqual(["あい", "うえ"])
  expect(wrap("", em(4), F)).toEqual([""])
  expect(wrap("あ\n\nい", em(4), F)).toEqual(["あ", "", "い"])
})

test("英語は語の切れ目（空白）で折り返し、行の頭と終わりの空白は落とす", () => {
  const w = textWidth("hello world", F)
  expect(wrap("hello world again", w, F)).toEqual(["hello world", "again"])
  expect(wrap("hello  world", textWidth("world", F), F)).toEqual(["hello", "world"])
})

test("1 行に収まらない語は字で切る", () => {
  const lines = wrap("abcdefghijklmnopqrstuvwxyz", textWidth("abcdefgh", F), F)
  expect(lines.join("")).toBe("abcdefghijklmnopqrstuvwxyz")
  expect(lines.length).toBeGreaterThan(2)
  for (const l of lines) expect(textWidth(l, F)).toBeLessThanOrEqual(textWidth("abcdefgh", F))
})

test("句読点・閉じ括弧・小書きの仮名は行の頭に置かず、前の字と一緒に次の行へ送る", () => {
  expect(wrap("あいうえ。お", em(4), F)).toEqual(["あいう", "え。お"])
  expect(wrap("あいうえ」お", em(4), F)).toEqual(["あいう", "え」お"])
  expect(wrap("あいうえっお", em(4), F)).toEqual(["あいう", "えっお"])
})

test("開き括弧は行の終わりに置かず、次の行へ送る", () => {
  expect(wrap("あいう「えお」", em(4), F)).toEqual(["あいう", "「えお」"])
})

test("禁則で送ると次の行に収まらないときは、禁則を見ずに折る", () => {
  expect(wrap("あ。。。。", em(1), F)).toEqual(["あ", "。", "。", "。", "。"])
})

test("英語と和文が混じっても、語は切らずに和文の字の間で折る", () => {
  const lines = wrap("今日は matomezu で図を描く", em(6), F)
  expect(lines.join("").replace(/ /g, "")).toBe("今日はmatomezuで図を描く")
  expect(lines.some(l => l.includes("matomezu"))).toBe(true)
  for (const l of lines) expect(textWidth(l, F)).toBeLessThanOrEqual(em(6))
})

test("最大の行数を超えたら、最後の行を … を足して幅に収める", () => {
  const lines = wrap("あいうえおかきくけこさしすせそ", em(5), F)
  expect(clampLines(lines, 2, em(5), F)).toEqual(["あいうえお", "かきくけ…"])
  expect(clampLines(lines, 5, em(5), F)).toEqual(lines)
  expect(clampLines(["あいう", "えお"], 1, em(5), F)).toEqual(["あいう…"])
})
