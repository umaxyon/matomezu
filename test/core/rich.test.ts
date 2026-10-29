// 本文の装飾（base の text/rich.ts・edit.ts・text-colors.ts）
import { expect, test } from "bun:test"
import type { Book } from "../../web/src/core/schema/book"
import { restoreSettings, userSetting } from "../../web/src/core/settings"
import { TEXT_LOOK, wrap } from "../../web/src/plugins/base"
import { decorate } from "../../web/src/plugins/base/text/edit"
import { clampRich, parseRich, plainOf, textColorRef, wrapRich } from "../../web/src/plugins/base/text/rich"
import { type TextColorValues as TextColors, textColorsOf } from "../../web/src/plugins/base/text/text-colors"
import { CORE_CATALOG, newStore } from "../support"

const W = "@matomezu/base:warn"

test("**太字** と {色:文字} を区切りに分ける。base の色は名前だけで書け、ほかのプラグインの色は id で書く", () => {
  expect(parseRich("a**b**c")).toEqual([
    [
      { text: "a", bold: false, color: null },
      { text: "b", bold: true, color: null },
      { text: "c", bold: false, color: null },
    ],
  ])
  expect(parseRich("{warn:注意}と{@ex/p:mark:印}")).toEqual([
    [
      { text: "注意", bold: false, color: W },
      { text: "と", bold: false, color: null },
      { text: "印", bold: false, color: "@ex/p:mark" },
    ],
  ])
  // 太字と色は重ねられる
  expect(parseRich("{warn:**強い**注意}")[0]).toEqual([
    { text: "強い", bold: true, color: W },
    { text: "注意", bold: false, color: W },
  ])
})

test("対にならない記号はただの文字。色の中の色・改行をまたぐ記号も対にしない", () => {
  expect(parseRich("**a").map(plainOf)).toEqual(["**a"])
  expect(parseRich("a**b**c**").map(plainOf)).toEqual(["abc**"])
  expect(parseRich("{warn:a").map(plainOf)).toEqual(["{warn:a"])
  expect(parseRich('{"a":1} }').map(plainOf)).toEqual(['{"a":1} }'])
  expect(parseRich("{warn:{info:a}b}").map(plainOf)).toEqual(["{info:ab}"])
  expect(parseRich("**a\nb**").map(plainOf)).toEqual(["**a", "b**"])
})

test("装飾の無い本文は、今までの折り返しと同じ行。太字は太字の幅で測り、… も付く", () => {
  const text = "あいうえおかきくけこ abc def ghi\n次の段落"
  expect(wrapRich(text, 80, TEXT_LOOK.body).map(plainOf)).toEqual(wrap(text, 80, TEXT_LOOK.body))
  const plain = wrapRich("W".repeat(20), 100, TEXT_LOOK.body).length
  expect(wrapRich(`**${"W".repeat(20)}**`, 100, TEXT_LOOK.body).length).toBeGreaterThanOrEqual(plain)
  const lines = wrapRich("{warn:あいうえおかきくけこさしすせそ}", 40, TEXT_LOOK.body)
  const two = clampRich(lines, 2, 40, TEXT_LOOK.body)
  expect(two).toHaveLength(2)
  expect(plainOf(two[1]!)).toMatch(/…$/)
  expect(two[1]!.at(-1)!.color).toBe(W)
})

test("選んだ範囲に太字・色を付け、もう付いていれば外す。違う色なら替える", () => {
  expect(decorate("abc", 1, 2, { bold: true })).toEqual({ text: "a**b**c", start: 3, end: 4 })
  expect(decorate("a**b**c", 3, 4, { bold: true })).toEqual({ text: "abc", start: 1, end: 2 })
  expect(decorate("abc", 1, 2, { color: "warn" })).toEqual({ text: "a{warn:b}c", start: 7, end: 8 })
  expect(decorate("a{warn:b}c", 7, 8, { color: "info" })).toEqual({ text: "a{info:b}c", start: 7, end: 8 })
  expect(decorate("a{warn:b}c", 7, 8, { color: "warn" })).toEqual({ text: "abc", start: 1, end: 2 })
  expect(decorate("a{warn:b}c", 7, 8, { color: null })).toEqual({ text: "abc", start: 1, end: 2 })
  expect(decorate("abc", 1, 2, { color: null })).toEqual({ text: "abc", start: 1, end: 2 })
  expect(decorate("ab", 1, 1, { bold: true })).toEqual({ text: "a****b", start: 3, end: 3 })
  expect(textColorRef(W)).toBe("warn")
  expect(textColorRef("@ex/p:mark")).toBe("@ex/p:mark")
})

test("文字の色は定義の色を、ブックの設定、見る人の上書きの順に上書きする", () => {
  const book = {
    type: "@matomezu/drawing:drawing",
    id: "b",
    title: "",
    pages: [],
    settings: { "@matomezu/base:book-text-colors": { [W]: "#111111" } },
  } as unknown as Book
  const plain = { ...book, settings: undefined } as unknown as Book
  expect(textColorsOf(CORE_CATALOG, plain).get(W)).toBe("#d97706")
  expect(textColorsOf(CORE_CATALOG, book).get(W)).toBe("#111111")
  expect(textColorsOf(CORE_CATALOG, book, { [W]: "#222222" }).get(W)).toBe("#222222")
  expect([...textColorsOf(CORE_CATALOG, plain).keys()]).toEqual([
    "@matomezu/base:success",
    "@matomezu/base:info",
    W,
    "@matomezu/base:error",
  ])
})

test("見る人の文字の色は利用者の設定の項目 text-colors で、値を丸ごと置き換え（null で既定に戻す）、ブックの色より強い。形の合わない色は断り、無い色の id は残す", () => {
  const store = newStore()
  const { state, actions } = store
  const set = (colors: Record<string, string> | null) =>
    actions.perform("@matomezu/base:settings-set", { values: { "@matomezu/base:text-colors": colors } }).ok
  const viewer = () => userSetting(CORE_CATALOG, state.getState().settings, "@matomezu/base:text-colors") as TextColors
  expect(set({ [W]: "#abcdef" })).toBe(true)
  expect(viewer()).toEqual({ [W]: "#abcdef" })
  const book = state.getState().books.b1 as Book
  expect(textColorsOf(CORE_CATALOG, book, viewer()).get(W)).toBe("#abcdef")
  expect(set({ [W]: "red" })).toBe(false)
  expect(set({ "@ex/p:none": "#000000" })).toBe(true)
  expect(viewer()).toEqual({ "@ex/p:none": "#000000" })
  expect(set(null)).toBe(true)
  expect(state.getState().settings).toEqual({})
  expect(viewer()).toEqual({})
  // 残した値が形に合わなければ、読むときに既定（値は捨てずに残す）
  const restored = restoreSettings({ "@matomezu/base:text-colors": { a: 1 } })
  expect(restored).toEqual({ "@matomezu/base:text-colors": { a: 1 } })
  expect(userSetting(CORE_CATALOG, restored, "@matomezu/base:text-colors")).toEqual({})
})
