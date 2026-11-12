// コードの色付け: 言語名とコードから、字の並びと、それぞれの色の種類（CodeSpan）を返す。外のライブラリ refractor（Prism の文法）を読むのはこのファイルだけで、
// 色付けした木（hast）は外に出さず、色の種類の並びに移して返す。言語はよく使う物（refractor の common）と zig。言語名は別名（ts・sh・yml など）でもよく、大文字小文字は問わない。
// 言語名が無い・知らないときは、全体を plain の 1 つで返す（言語を当てる自動の判定はしない）。返した並びの字をつなぐと、元のコードにそのまま戻る。
// Prism の細かい種類（token の後ろのクラス名）は COLOR_OF の表で色の種類にまとめる。1 つの要素に名前がいくつかあれば前の物から引き、
// 入れ子ではいちばん内側で表に当たる物が勝つ（当たらない要素は外の色のまま）。表に無い物は plain（字の色のまま）
import type { ElementContent } from "hast"
import { refractor } from "refractor"
import zig from "refractor/zig"
import { CODE_COLORS, type CodeColor } from "../../../core/color"

refractor.register(zig)

// 色の種類は core/color.ts（スキンの既定の値も同じ種類で持つ）
export { CODE_COLORS, type CodeColor }

// 色付けした字の並びの 1 つ（color が plain なら字の色のまま）
export interface CodeSpan {
  text: string
  color: CodeColor | "plain"
}

const COLOR_OF: Readonly<Record<string, CodeColor>> = {
  comment: "comment",
  prolog: "comment",
  cdata: "comment",
  shebang: "comment",
  hashbang: "comment",
  keyword: "keyword",
  important: "keyword",
  atrule: "keyword",
  module: "keyword",
  string: "string",
  char: "string",
  regex: "string",
  "regex-literal": "string",
  "template-string": "string",
  "string-literal": "string",
  "raw-string": "string",
  "triple-quoted-string": "string",
  url: "string",
  "attr-value": "string",
  number: "constant",
  boolean: "constant",
  constant: "constant",
  symbol: "constant",
  nil: "constant",
  null: "constant",
  entity: "constant", // Prism の entity は HTML の文字参照（&amp; など）。色の種類の entity（関数・クラスの名前）とは別
  function: "entity",
  "function-definition": "entity",
  "function-name": "entity",
  "function-variable": "entity",
  "generic-function": "entity",
  "method-definition": "entity",
  "class-name": "entity",
  "class-name-definition": "entity",
  "constructor-invocation": "entity",
  title: "entity",
  builtin: "type",
  "builtin-type": "type",
  "type-definition": "type",
  "return-type": "type",
  "type-expression": "type",
  property: "variable",
  "attr-name": "variable",
  variable: "variable",
  parameter: "variable",
  key: "variable",
  "literal-property": "variable",
  "named-parameter": "variable",
  tag: "tag",
  selector: "tag",
  doctype: "meta",
  macro: "meta",
  preprocessor: "meta",
  directive: "meta",
  "other-directive": "meta",
  annotation: "meta",
  decorator: "meta",
  "front-matter-block": "meta",
  inserted: "added",
  "inserted-sign": "added",
  deleted: "removed",
  "deleted-sign": "removed",
}

// code を言語 language で色付けした並び（隣り合う同じ色はまとめる）
export function highlightCode(code: string, language?: string): CodeSpan[] {
  const lang = language?.toLowerCase()
  if (!lang || !refractor.registered(lang)) return code === "" ? [] : [{ text: code, color: "plain" }]
  const spans: CodeSpan[] = []
  const push = (text: string, color: CodeSpan["color"]) => {
    const last = spans.at(-1)
    if (last?.color === color) last.text += text
    else if (text !== "") spans.push({ text, color })
  }
  const walk = (nodes: readonly ElementContent[], color: CodeSpan["color"]) => {
    for (const node of nodes) {
      if (node.type === "text") push(node.value, color)
      else if (node.type === "element") walk(node.children, colorOf(node.properties.className, color))
    }
  }
  walk(refractor.highlight(code, lang).children as ElementContent[], "plain")
  return spans
}

// 要素のクラス名（token と、Prism の種類の名前）から、色の種類（どれも表に無ければ外の色 outer）
function colorOf(className: unknown, outer: CodeSpan["color"]): CodeSpan["color"] {
  const names: unknown[] = Array.isArray(className) ? className : []
  return names.map(name => (typeof name === "string" ? COLOR_OF[name] : undefined)).find(c => c !== undefined) ?? outer
}
