// コードの色付け（base/code-highlight/highlight.ts）: 言語名とコードから、字の並びと色の種類を返す。並びの字をつなぐと元のコードに戻る
import { expect, test } from "bun:test"
import { CODE_COLORS, highlightCode } from "../../web/src/plugins/base/code-highlight/highlight"
import { MARKDOWN_TOKENS } from "../../web/src/plugins/books/markdown/tokens"

const colorOf = (spans: ReturnType<typeof highlightCode>, text: string) => spans.find(s => s.text === text)?.color

test("言語名が無い・知らないときは、全体を色の無い 1 つで返す（空のコードは空の並び）", () => {
  expect(highlightCode("const a = 1")).toEqual([{ text: "const a = 1", color: "plain" }])
  expect(highlightCode("const a = 1", "nothing")).toEqual([{ text: "const a = 1", color: "plain" }])
  expect(highlightCode("", "ts")).toEqual([])
})

test("言語名は別名でも大文字でもよく、キーワード・文字列・数・コメントに色の種類が付く。zig も使える", () => {
  for (const lang of ["ts", "TS", "typescript"]) {
    const spans = highlightCode('const a = "s" + 1 // x', lang)
    expect(colorOf(spans, "const")).toBe("keyword")
    expect(colorOf(spans, '"s"')).toBe("string")
    expect(colorOf(spans, "1")).toBe("constant")
    expect(colorOf(spans, "// x")).toBe("comment")
  }
  expect(colorOf(highlightCode("const x: u8 = 1;", "zig"), "const")).toBe("keyword")
})

test("html はタグ・属性・値に色の種類が付き、入れ子ではいちばん内側で当たる種類が勝つ（当たらない要素は外の色）", () => {
  // タグの中の < と属性の値の中の = は、表に無い punctuation なので、外の tag・attr-value（string）の色
  expect(highlightCode('<a href="x">t</a>', "html")).toEqual([
    { text: "<a ", color: "tag" },
    { text: "href", color: "variable" },
    { text: '="x"', color: "string" },
    { text: ">", color: "tag" },
    { text: "t", color: "plain" },
    { text: "</a>", color: "tag" },
  ])
})

test("どの入力でも、返した並びの字をつなぐと元のコードに戻り、隣り合う同じ色はまとまっている", () => {
  const codes: [string, string | undefined][] = [
    // biome-ignore lint/suspicious/noTemplateCurlyInString: 色付けするコードの中の、テンプレート文字列の差し込み
    ["function f(a: number): string {\n  return `${a}`\n}\n", "ts"],
    ['<div class="a">\n  <!-- c -->\n</div>', "html"],
    ["+ added\n- removed\n  same", "diff"],
    ["SELECT * FROM t WHERE a = 'x';", "sql"],
    ["just text", undefined],
  ]
  for (const [code, lang] of codes) {
    const spans = highlightCode(code, lang)
    expect(spans.map(s => s.text).join("")).toBe(code)
    expect(spans.every((s, i) => i === 0 || spans[i - 1]!.color !== s.color)).toBe(true)
  }
  const diff = highlightCode("+ added\n- removed", "diff")
  expect(diff.find(s => s.text.includes("added"))?.color).toBe("added")
  expect(diff.find(s => s.text.includes("removed"))?.color).toBe("removed")
})

test("色の種類のどれにも、マークダウンのテーマキー markdown-code-color-<種類> がある（書き忘れると字の色のまま出るため）", () => {
  const ids = new Set(MARKDOWN_TOKENS.map(t => t.id))
  expect(CODE_COLORS.filter(c => !ids.has(`markdown-code-color-${c}`))).toEqual([])
})
