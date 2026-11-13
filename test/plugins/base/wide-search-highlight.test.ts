// 横断検索の結果の行の、当たった所の切り出し（base/wide-search/highlight.ts）
import { expect, test } from "bun:test"
import { highlightParts } from "../../../web/src/plugins/base/wide-search/highlight"

const hits = (text: string, input: string) => highlightParts(text, input).map(p => (p.hit ? `[${p.text}]` : p.text))

test("入力した言葉に当たった所を、大文字小文字を分けずに切り出す", () => {
  expect(hits("Login page", "login")).toEqual(["[Login]", " page"])
  expect(hits("ログイン画面を直す", "画面")).toEqual(["ログイン", "[画面]", "を直す"])
})

test("空白で分けた語は、どれにも当たる（長い語を先に当てる）。続く当たりは 1 つにまとめる", () => {
  expect(hits("abc def", "abc def")).toEqual(["[abc]", " ", "[def]"])
  expect(hits("abcdef", "abc def")).toEqual(["[abcdef]"])
  expect(hits("foobar", "foo foobar")).toEqual(["[foobar]"])
})

test("語が無ければ全体を 1 つにする。正規表現の記号はそのままの字として当たる", () => {
  expect(hits("abc", "")).toEqual(["abc"])
  expect(hits("abc", "   ")).toEqual(["abc"])
  expect(hits("", "a")).toEqual([])
  expect(hits("a.c a*c", "a.c")).toEqual(["[a.c]", " a*c"])
  expect(hits("100% (x)", "(x) %")).toEqual(["100", "[%]", " ", "[(x)]"])
})
