// 本文の装飾（base の text/rich.ts・edit.ts・text-colors.ts）
import { expect, test } from "bun:test"
import type { Book } from "../../web/src/core/schema/book"
import { restoreSettings, userSetting } from "../../web/src/core/settings"
import { TEXT_LOOK, wrap } from "../../web/src/plugins/base"
import {
  charsOf,
  type Decoration,
  insertChars,
  restyle,
  styleAt,
  styled,
  textOf,
} from "../../web/src/plugins/base/text/edit"
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

test("選んだ範囲に太字・色を付け、もう付いていれば外す。違う色なら替える。位置は記号を数えない字の位置", () => {
  const I = "@matomezu/base:info"
  const deco = (text: string, start: number, end: number, d: Decoration) =>
    textOf(restyle(charsOf(text), start, end, d))
  expect(deco("abc", 1, 2, { bold: true })).toBe("a**b**c")
  expect(deco("a**b**c", 1, 2, { bold: true })).toBe("abc")
  expect(deco("a**b**c", 0, 2, { bold: true })).toBe("**ab**c")
  expect(deco("abc", 1, 2, { color: W })).toBe("a{warn:b}c")
  expect(deco("a{warn:b}c", 1, 2, { color: I })).toBe("a{info:b}c")
  expect(deco("a{warn:b}c", 1, 2, { color: W })).toBe("abc")
  expect(deco("a{warn:b}c", 1, 2, { color: null })).toBe("abc")
  expect(deco("abc", 1, 1, { bold: true })).toBe("abc")
  expect(deco("気をつける所", 0, 3, { bold: true })).toBe("**気をつ**ける所")
  expect(deco("**気をつ**ける所", 0, 3, { color: W })).toBe("**{warn:気をつ}**ける所")
  // 改行をまたいでも、段落ごとに記号を書く
  expect(deco("ab\ncd", 1, 4, { bold: true })).toBe("a**b**\n**c**d")
  expect(styled({ bold: false, color: W }, { color: W })).toEqual({ bold: false, color: null })
  const typed = insertChars(charsOf("**a**"), 1, 1, "b", styleAt(charsOf("**a**"), 1))
  expect(textOf(typed)).toBe("**ab**")
  expect(textColorRef(W)).toBe("warn")
  expect(textColorRef("@ex/p:mark")).toBe("@ex/p:mark")
})

test("記号の字の前の \\ でただの文字になり、戻すときは記号に読める字にだけ \\ を置く", () => {
  expect(parseRich("\\*\\*a\\*\\*").map(plainOf)).toEqual(["**a**"])
  expect(parseRich("\\{warn:a\\}").map(plainOf)).toEqual(["{warn:a}"])
  expect(parseRich("C:\\path\\\\x").map(plainOf)).toEqual(["C:\\path\\x"])
  expect(parseRich("{warn:a\\}b}")[0]).toEqual([{ text: "a}b", bold: false, color: W }])
  const plain = (text: string) => textOf([...text].map(ch => ({ ch, bold: false, color: null })))
  expect(plain("2*3 {a} C:\\x")).toBe("2*3 {a} C:\\x")
  expect(plain("**a**")).toBe("\\*\\*a\\*\\*")
  expect(plain("{warn:a}")).toBe("\\{warn:a}")
  expect(plain("a\\")).toBe("a\\\\")
  // 読み直すと同じ字と装飾になる
  for (const text of ["*a*", "a\\*b", "{x:}", "}", "\\", "**", "a{warn:b"]) {
    const chars = [...text].map((ch, i) => ({ ch, bold: i % 2 === 0, color: i % 3 === 0 ? W : null }))
    expect(charsOf(textOf(chars))).toEqual(chars)
  }
})

test("文字の色は定義の色を、テーマ、ブックの設定、見る人の上書きの順に上書きする", () => {
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
  const themed = (more: Record<string, unknown>) =>
    ({ ...book, settings: { "@matomezu/base:book-theme": "@matomezu/base:matomezu", ...more } }) as unknown as Book
  expect(textColorsOf(CORE_CATALOG, themed({})).get(W)).toBe("#b86e00")
  expect(textColorsOf(CORE_CATALOG, themed({ "@matomezu/base:book-text-colors": { [W]: "#111111" } })).get(W)).toBe(
    "#111111",
  )
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
