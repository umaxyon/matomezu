// Markdown の原文を読む（CommonMark と GFM: 表・打ち消し線・タスクのリスト・脚注・URL のリンク）。外のライブラリ（mdast-util-from-markdown・mdast-util-gfm・micromark-extension-gfm）を読むのはこのファイルだけで、
// 読んだ木（mdast）は外に出さず、ページの原文を読んだ形（MarkdownDocument）に移して返す。
// 参照の形のリンクと画像は、ここで定義を引いて、ふつうのリンクと画像にする（定義は返さない）。生の HTML は、ブロックは html、文中は文字にする。
// 脚注は、最初に参照した順に 1 から番号を振る。同じ脚注の参照は同じ番号で、参照の無い定義は落とす
import type * as Mdast from "mdast"
import { fromMarkdown } from "mdast-util-from-markdown"
import { gfmFromMarkdown } from "mdast-util-gfm"
import { gfm } from "micromark-extension-gfm"

// 原文の中の位置（文字列の添え字。end は含まない）
export interface MarkdownRange {
  start: number
  end: number
}

// 文中の要素
export type MarkdownInline = { range: MarkdownRange } & (
  | { kind: "text"; value: string }
  | { kind: "strong" | "emphasis" | "delete"; children: MarkdownInline[] }
  | { kind: "inlineCode"; value: string }
  | { kind: "link"; url: string; title?: string; children: MarkdownInline[] }
  | { kind: "image"; url: string; alt: string; title?: string }
  | { kind: "break" }
  | { kind: "footnoteReference"; number: number }
)

export type MarkdownAlign = "left" | "center" | "right" | "none"
// リストの項目のチェック（タスクのリストでなければ none）
export type MarkdownCheck = "none" | "unchecked" | "checked"

export interface MarkdownListItem {
  check: MarkdownCheck
  children: MarkdownBlock[]
  range: MarkdownRange
}
export interface MarkdownTableCell {
  children: MarkdownInline[]
  range: MarkdownRange
}

// 段落・見出しなどのブロック。見出しの fragment は、文中の #… のリンクで飛ぶ先のフラグメント（GitHub と同じ作り方）。生の HTML は html で、中身は文字のまま
export type MarkdownBlock = { range: MarkdownRange } & (
  | { kind: "paragraph"; children: MarkdownInline[] }
  | { kind: "heading"; depth: 1 | 2 | 3 | 4 | 5 | 6; fragment: string; children: MarkdownInline[] }
  | { kind: "blockquote"; children: MarkdownBlock[] }
  // 番号付きのリスト（ordered）は始まりの番号 start を持つ。spread は項目の間を空けるか
  | ({ kind: "list"; spread: boolean; items: MarkdownListItem[] } & (
      | { ordered: true; start: number }
      | { ordered: false }
    ))
  | { kind: "code"; lang?: string; value: string }
  | { kind: "thematicBreak" }
  | { kind: "table"; align: MarkdownAlign[]; head: MarkdownTableCell[]; body: MarkdownTableCell[][] }
  | { kind: "html"; value: string }
)

// 脚注の定義（number は参照の番号）
export interface MarkdownFootnote {
  number: number
  children: MarkdownBlock[]
  range: MarkdownRange
}

// ページの原文を読んだ形: 原文の順のブロックと、番号の順の脚注
export interface MarkdownDocument {
  blocks: MarkdownBlock[]
  footnotes: MarkdownFootnote[]
}

type Definitions = ReadonlyMap<string, Mdast.Definition>

// 読んでいる途中の物: 原文・参照の形の定義・脚注の定義・振った番号・見出しの名前の数
interface Reading {
  text: string
  definitions: Definitions
  notes: ReadonlyMap<string, Mdast.FootnoteDefinition>
  numbers: Map<string, number>
  fragments: Map<string, number>
}

export function parseMarkdown(text: string): MarkdownDocument {
  const root = fromMarkdown(text, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] })
  const definitions = new Map<string, Mdast.Definition>()
  const notes = new Map<string, Mdast.FootnoteDefinition>()
  collect(root, definitions, notes)
  const r: Reading = { text, definitions, notes, numbers: new Map(), fragments: new Map() }
  const blocks = blocksOf(r, root.children)
  // 脚注の中の参照も番号を振る（読む間に足した番号も、続けて読む）
  const footnotes: MarkdownFootnote[] = []
  for (const [id, number] of r.numbers) {
    const note = notes.get(id)
    if (note) footnotes.push({ number, children: blocksOf(r, note.children), range: rangeOf(note) })
  }
  return { blocks, footnotes }
}

// 定義（参照の形のリンクと脚注）は、どこに書いてあっても効く（同じ名前は先の物）
function collect(
  node: Mdast.Parent,
  definitions: Map<string, Mdast.Definition>,
  notes: Map<string, Mdast.FootnoteDefinition>,
) {
  for (const c of node.children) {
    if (c.type === "definition" && !definitions.has(c.identifier)) definitions.set(c.identifier, c)
    if (c.type === "footnoteDefinition" && !notes.has(c.identifier)) notes.set(c.identifier, c)
    if ("children" in c) collect(c, definitions, notes)
  }
}

const rangeOf = (node: Mdast.Node): MarkdownRange => ({
  start: node.position?.start.offset ?? 0,
  end: node.position?.end.offset ?? 0,
})

const sourceOf = (r: Reading, node: Mdast.Node) => {
  const { start, end } = rangeOf(node)
  return r.text.slice(start, end)
}

function blocksOf(r: Reading, nodes: readonly Mdast.Node[]): MarkdownBlock[] {
  return nodes.flatMap(n => {
    const b = blockOf(r, n as Mdast.RootContent)
    return b ? [b] : []
  })
}

function blockOf(r: Reading, node: Mdast.RootContent): MarkdownBlock | undefined {
  const range = rangeOf(node)
  switch (node.type) {
    case "paragraph":
      return { kind: "paragraph", children: inlinesOf(r, node.children), range }
    case "heading": {
      const children = inlinesOf(r, node.children)
      return { kind: "heading", depth: node.depth, fragment: fragmentOf(r, children), children, range }
    }
    case "blockquote":
      return { kind: "blockquote", children: blocksOf(r, node.children), range }
    case "list":
      return {
        kind: "list",
        ...(node.ordered ? { ordered: true, start: node.start ?? 1 } : { ordered: false }),
        spread: node.spread ?? false,
        items: node.children.map(item => ({
          check: item.checked === true ? "checked" : item.checked === false ? "unchecked" : "none",
          children: blocksOf(r, item.children),
          range: rangeOf(item),
        })),
        range,
      }
    case "code":
      return { kind: "code", ...(node.lang ? { lang: node.lang } : {}), value: node.value, range }
    case "thematicBreak":
      return { kind: "thematicBreak", range }
    case "table": {
      const cells = (row: Mdast.TableRow) =>
        row.children.map(c => ({ children: inlinesOf(r, c.children), range: rangeOf(c) }))
      const [head, ...body] = node.children
      return {
        kind: "table",
        align: (node.align ?? []).map(a => a ?? "none"),
        head: head ? cells(head) : [],
        body: body.map(cells),
        range,
      }
    }
    case "html":
      return { kind: "html", value: node.value, range }
    default:
      // 定義（参照の形と脚注）は返さない
      return undefined
  }
}

function inlinesOf(r: Reading, nodes: readonly Mdast.PhrasingContent[]): MarkdownInline[] {
  return nodes.map(n => inlineOf(r, n))
}

function inlineOf(r: Reading, node: Mdast.PhrasingContent): MarkdownInline {
  const range = rangeOf(node)
  const text = (): MarkdownInline => ({ kind: "text", value: sourceOf(r, node), range })
  switch (node.type) {
    case "text":
      return { kind: "text", value: node.value, range }
    case "html":
      return { kind: "text", value: node.value, range }
    case "strong":
    case "emphasis":
    case "delete":
      return { kind: node.type, children: inlinesOf(r, node.children), range }
    case "inlineCode":
      return { kind: "inlineCode", value: node.value, range }
    case "break":
      return { kind: "break", range }
    case "link":
      return { kind: "link", url: node.url, ...titled(node.title), children: inlinesOf(r, node.children), range }
    case "image":
      return { kind: "image", url: node.url, alt: node.alt ?? "", ...titled(node.title), range }
    case "linkReference": {
      const d = r.definitions.get(node.identifier)
      if (!d) return text()
      return { kind: "link", url: d.url, ...titled(d.title), children: inlinesOf(r, node.children), range }
    }
    case "imageReference": {
      const d = r.definitions.get(node.identifier)
      if (!d) return text()
      return { kind: "image", url: d.url, alt: node.alt ?? "", ...titled(d.title), range }
    }
    case "footnoteReference": {
      if (!r.notes.has(node.identifier)) return text()
      const number = r.numbers.get(node.identifier) ?? r.numbers.size + 1
      r.numbers.set(node.identifier, number)
      return { kind: "footnoteReference", number, range }
    }
    default:
      return text()
  }
}

const titled = (title: string | null | undefined) => (title ? { title } : {})

const plainText = (inlines: readonly MarkdownInline[]): string =>
  inlines
    .map(i => ("value" in i ? i.value : "children" in i ? plainText(i.children) : i.kind === "image" ? i.alt : ""))
    .join("")

// 見出しのフラグメント: 小文字にし、文字・数字・空白・- と _ のほかを除き、空白を - にする。同じフラグメントの 2 つ目からは -1・-2 を付ける
function fragmentOf(r: Reading, children: readonly MarkdownInline[]): string {
  const base = plainText(children)
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-")
  const seen = r.fragments.get(base) ?? 0
  r.fragments.set(base, seen + 1)
  return seen === 0 ? base : `${base}-${seen}`
}
