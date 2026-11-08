// 原文の中を探す（base/search/find.ts）: 当たり・置き換え・次と前
import { expect, test } from "bun:test"
import { findAll, nextHit, replaceAll, replaceOne, type SearchQuery } from "../../web/src/plugins/base/search/find"

const q = (text: string, opts: Partial<SearchQuery> = {}): SearchQuery => ({
  text,
  caseSensitive: false,
  regex: false,
  ...opts,
})
const hits = (source: string, query: SearchQuery) => {
  const found = findAll(source, query)
  return found.kind === "hits" ? found.hits.map(h => source.slice(h.start, h.end)) : found.kind
}

test("字のままなら記号もそのまま探し、既定では大文字小文字を区別しない。区別すると分ける。空の字は当たり無し", () => {
  expect(hits("a.b A.B axb", q("a.b"))).toEqual(["a.b", "A.B"])
  expect(hits("a.b A.B axb", q("a.b", { caseSensitive: true }))).toEqual(["a.b"])
  expect(hits("abc", q(""))).toEqual([])
})

test("正規表現: ^ と $ は行ごと、. は改行に当たらず、\\n で行をまたぐ。幅 0 の当たりは飛ばす。読めない式は bad-pattern", () => {
  const source = "one\ntwo\nthree"
  expect(hits(source, q("^t\\w+$", { regex: true }))).toEqual(["two", "three"])
  expect(hits(source, q("one.two", { regex: true }))).toEqual([])
  expect(hits(source, q("one\\ntwo", { regex: true }))).toEqual(["one\ntwo"])
  expect(hits("aaa", q("x*", { regex: true }))).toEqual([])
  expect(hits("abc", q("(", { regex: true }))).toBe("bad-pattern")
  // サロゲートペアの字も 1 字として当たる
  expect(hits("𠮷野家", q("^.野", { regex: true }))).toEqual(["𠮷野"])
})

test("1 つ置換は、同じ字が何か所あってもその当たりだけを替え、正規表現なら $1 を使え、前後の字の条件も効く", () => {
  const source = "cat cat cat"
  const second = { start: 4, end: 7 }
  expect(replaceOne(source, q("cat"), second, "dog")).toBe("cat dog cat")
  expect(replaceOne("ab ab", q("(a)(b)", { regex: true }), { start: 3, end: 5 }, "$2$1")).toBe("ab ba")
  // 字のままなら $1 は字のまま
  expect(replaceOne("ab", q("ab"), { start: 0, end: 2 }, "$1")).toBe("$1")
  // 後ろ読み: x の後ろの a だけが当たり
  expect(replaceOne("xa ya", q("(?<=x)a", { regex: true }), { start: 1, end: 2 }, "b")).toBe("xb ya")
  // もう当たりでない所は替えない
  expect(replaceOne(source, q("cat"), { start: 1, end: 4 }, "dog")).toBe(source)
})

test("全部置換は当たりを全部替える（正規表現の $1 も）", () => {
  expect(replaceAll("Cat cat CAT", q("cat"), "dog")).toBe("dog dog dog")
  expect(replaceAll("a1 b2", q("(\\w)(\\d)", { regex: true }), "$2$1")).toBe("1a 2b")
  expect(replaceAll("abc", q("(", { regex: true }), "x")).toBe("abc")
})

test("次・前の当たり: 位置から向きに進み、端では回るか止まる", () => {
  const list = [
    { start: 2, end: 3 },
    { start: 5, end: 6 },
    { start: 9, end: 10 },
  ]
  expect(nextHit(list, 3, "forward", true)).toBe(1)
  expect(nextHit(list, 10, "forward", true)).toBe(0)
  expect(nextHit(list, 10, "forward", false)).toBe("none")
  expect(nextHit(list, 5, "backward", true)).toBe(0)
  expect(nextHit(list, 2, "backward", true)).toBe(2)
  expect(nextHit(list, 2, "backward", false)).toBe("none")
  expect(nextHit([], 0, "forward", true)).toBe("none")
})
