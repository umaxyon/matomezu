// Markdown の原文を読む（base の markdown/parse.ts）
import { expect, test } from "bun:test"
import { type MarkdownBlock, type MarkdownInline, parseMarkdown } from "../../web/src/plugins/base"

const blocks = (text: string) => parseMarkdown(text).blocks
const only = (text: string) => blocks(text)[0]!
const inlines = (b: MarkdownBlock): MarkdownInline[] => ("children" in b ? (b.children as MarkdownInline[]) : [])
// 位置から原文を引く
const at = (text: string, r: { start: number; end: number }) => text.slice(r.start, r.end)

test("ブロックは原文の順で、見出しの深さと段落の文中の要素を持つ", () => {
  const text = "# Title\n\nsome **bold** and *it* and ~~gone~~ and `code`\n"
  const [h, p] = blocks(text)
  expect(h).toMatchObject({ kind: "heading", depth: 1, children: [{ kind: "text", value: "Title" }] })
  expect(p!.kind).toBe("paragraph")
  expect(inlines(p!).map(i => i.kind)).toEqual([
    "text",
    "strong",
    "text",
    "emphasis",
    "text",
    "delete",
    "text",
    "inlineCode",
  ])
  expect(at(text, inlines(p!)[1]!.range)).toBe("**bold**")
})

test("文中の要素の位置は、文字列の添え字で数える（サロゲートペアは 2、CRLF は 2）", () => {
  const text = "😀 a\r\n\r\n**b**"
  const [p1, p2] = blocks(text)
  expect(inlines(p1!)[0]!.range).toEqual({ start: 0, end: 4 })
  expect(inlines(p2!)[0]!.range).toEqual({ start: 8, end: 13 })
  expect(at(text, inlines(p2!)[0]!.range)).toBe("**b**")
})

test("タブを挟んでも、位置は原文どおり", () => {
  const text = ">\tq *e*"
  const quote = only(text)
  if (quote.kind !== "blockquote") throw new Error(quote.kind)
  expect(at(text, inlines(quote.children[0]!)[1]!.range)).toBe("*e*")
})

test("リストは番号付きかと、項目のチェックと、項目の間を空けるかを持つ", () => {
  expect(only("- [ ] a\n- [x] b\n- c\n")).toMatchObject({
    kind: "list",
    spread: false,
    items: [{ check: "unchecked" }, { check: "checked" }, { check: "none" }],
  })
  expect(only("- a\n- b\n")).not.toHaveProperty("start")
  expect(only("3. a\n\n4. b\n")).toMatchObject({ kind: "list", start: 3, spread: true })
})

test("表は見出しの行と本文の行と、列の寄せを持つ", () => {
  const table = only("| a | b | c |\n|:-|:-:|-|\n| x | y | z |\n")
  expect(table).toMatchObject({
    kind: "table",
    align: ["left", "center", "none"],
    head: [{ children: [{ value: "a" }] }, { children: [{ value: "b" }] }, { children: [{ value: "c" }] }],
    body: [[{ children: [{ value: "x" }] }, { children: [{ value: "y" }] }, { children: [{ value: "z" }] }]],
  })
})

test("コードは言語だけを持ち、言語の後ろの書き足しは落とす", () => {
  expect(only("```ts title=a\nlet a\n```\n")).toEqual({
    kind: "code",
    lang: "ts",
    value: "let a",
    range: { start: 0, end: 23 },
  })
  expect(only("```\nx\n```\n")).not.toHaveProperty("lang")
})

test("参照の形のリンクと画像は定義を引き、定義は返さない。定義の無い参照は文字のまま", () => {
  const text = '[r][R] ![i][R] [u]\n\n[R]: http://x.test "t"\n'
  const all = blocks(text)
  expect(all).toHaveLength(1)
  const [link, , image, rest] = inlines(all[0]!)
  expect(link).toMatchObject({ kind: "link", url: "http://x.test", title: "t", children: [{ value: "r" }] })
  expect(image).toMatchObject({ kind: "image", url: "http://x.test", alt: "i" })
  expect(rest).toMatchObject({ kind: "text", value: " [u]" })
})

test("URL だけの文もリンクになる", () => {
  expect(inlines(only("see https://x.test now"))[1]).toMatchObject({ kind: "link", url: "https://x.test" })
})

test("生の HTML は文字のまま", () => {
  expect(only("<div>a</div>\n")).toMatchObject({
    kind: "paragraph",
    children: [{ kind: "text", value: "<div>a</div>" }],
  })
  expect(inlines(only("a <b>c</b>"))[1]).toMatchObject({ kind: "text", value: "<b>" })
})

test("脚注は最初に参照した順に番号を振り、同じ脚注は同じ番号、参照の無い定義は落とす", () => {
  const doc = parseMarkdown("x[^b] y[^a] z[^b]\n\n[^a]: A\n[^b]: B\n[^c]: C\n")
  expect(
    inlines(doc.blocks[0]!)
      .filter(i => i.kind === "footnoteReference")
      .map(i => ("number" in i ? i.number : 0)),
  ).toEqual([1, 2, 1])
  expect(doc.footnotes.map(f => [f.number, f.children[0]!.kind === "paragraph" && inlines(f.children[0]!)[0]])).toEqual(
    [
      [1, expect.objectContaining({ value: "B" })],
      [2, expect.objectContaining({ value: "A" })],
    ],
  )
})

test("定義の無い脚注の参照は文字のまま", () => {
  const doc = parseMarkdown("x[^none]\n")
  expect(inlines(doc.blocks[0]!)).toMatchObject([{ kind: "text", value: "x[^none]" }])
  expect(doc.footnotes).toEqual([])
})

test("脚注の中の参照にも、続けて番号を振る", () => {
  const doc = parseMarkdown("x[^a]\n\n[^a]: A[^b]\n[^b]: B\n")
  expect(doc.footnotes.map(f => f.number)).toEqual([1, 2])
})

test("見出しの名前は GitHub と同じ作り方で、同じ名前の 2 つ目からは番号を付ける", () => {
  const names = blocks("# Hello, World!\n\n## Hello, World!\n\n## 日本語 の 見出し\n").map(b =>
    b.kind === "heading" ? b.anchor : "",
  )
  expect(names).toEqual(["hello-world", "hello-world-1", "日本語-の-見出し"])
})
