// 原文の中を探す（base/search/find.ts・search.ts）: 当たり・置き換え・次と前・数・今の当たりの選び直し
import { expect, test } from "bun:test"
import { findAll, replaceAll, replaceOne, type SearchQuery } from "../../../web/src/plugins/base/search/find"
import { changedSearch, replaceOneStep, searchCount, stepHit } from "../../../web/src/plugins/base/search/search"
import type { SearchOpen } from "../../../web/src/plugins/base/search/state"
import { CORE_CATALOG } from "../../support"

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
  // 先読みは元の原文を見る（替えたあとの字を見ない）
  expect(replaceAll("aaa", q("a(?=a)", { regex: true }), "b")).toBe("bba")
})

const page = (id: string, text: string) => ({
  kind: "page" as const,
  type: "@matomezu/markdown:markdown",
  id,
  title: id,
  paper: "@matomezu/base:a4",
  orientation: "portrait" as const,
  text,
})
const pagesOfTexts = (texts: readonly string[], query: SearchQuery) =>
  texts.map((t, i) => {
    const found = findAll(t, query)
    return { page: page(`p${i + 1}`, t), hits: found.kind === "hits" ? found.hits : [] }
  })
const book = (texts: readonly string[]) =>
  ({
    id: "b",
    title: "b",
    lineup: texts.map((t, i) => page(`p${i + 1}`, t)),
  }) as never
const open = (current: SearchOpen["current"], more: Partial<SearchOpen> = {}): SearchOpen => ({
  query: q("x"),
  replacement: "",
  scope: "book",
  wrap: true,
  current,
  focus: "find",
  opened: 1,
  ...more,
})

test("次・前はページをまたいで進み・戻り、ブックの端では回るか止まる", () => {
  const pages = pagesOfTexts(["x", "", "ax"], q("x"))
  expect(stepHit(pages, { page: "p1", at: 1 }, "forward", true)).toEqual({ page: "p3", start: 1, end: 2 })
  expect(stepHit(pages, { page: "p3", at: 1 }, "backward", true)).toEqual({ page: "p1", start: 0, end: 1 })
  expect(stepHit(pages, { page: "p3", at: 2 }, "forward", false)).toBe("none")
  expect(stepHit(pages, { page: "p3", at: 2 }, "forward", true)).toEqual({ page: "p1", start: 0, end: 1 })
  expect(stepHit(pages, { page: "p1", at: 0 }, "backward", false)).toBe("none")
})

test("探す字を変えると、今の当たりの頭から先の最初の当たりを選び直す。数は今の当たりの番号とページ", () => {
  const b = book(["ab ab", "ab"])
  const changed = changedSearch(CORE_CATALOG, b, open({ page: "p1", start: 3, end: 5 }), { query: q("ab") }, "p1")
  expect(changed.current).toEqual({ page: "p1", start: 3, end: 5 })
  expect(searchCount(CORE_CATALOG, b, changed, "p1")).toEqual({
    kind: "count",
    at: 2,
    all: 3,
    pages: { at: 1, all: 2 },
  })
  // 当たりでなくなった今の当たりは数えない
  expect(searchCount(CORE_CATALOG, b, { ...changed, current: { page: "p1", start: 1, end: 3 } }, "p1")).toMatchObject({
    at: 0,
  })
  expect(searchCount(CORE_CATALOG, b, { ...changed, query: q("(", { regex: true }) }, "p1")).toEqual({
    kind: "bad-pattern",
  })
})

test("1 つ置換のあとの次の当たりは、長さの違う置き換えでも置き換えた字の後ろから。今の当たりが無ければ置き換えずに次へ", () => {
  const b = book(["cat cat cat"])
  const step = replaceOneStep(
    CORE_CATALOG,
    b,
    open({ page: "p1", start: 0, end: 3 }, { query: q("cat"), replacement: "x", scope: "page" }),
    "p1",
  )
  expect(step.next).toEqual({ page: "p1", start: 2, end: 5 })
  expect(step.args).not.toBe("none")
  // 置き換えた字が探す字を含んでも、その中は探さない
  const grow = replaceOneStep(
    CORE_CATALOG,
    book(["a a"]),
    open({ page: "p1", start: 0, end: 1 }, { query: q("a"), replacement: "aa", scope: "page" }),
    "p1",
  )
  expect(grow.next).toEqual({ page: "p1", start: 3, end: 4 })
  const none = replaceOneStep(CORE_CATALOG, b, open("none", { query: q("cat"), scope: "page" }), "p1")
  expect(none).toEqual({ args: "none", next: { page: "p1", start: 0, end: 3 } })
})
