// 文中の言葉をリンクにする（原文は変えない）: 原文の文字から「リンクにする所」の一覧（WordLink。原文の中の位置・長さ・行き先）だけを作り、描くときに文字を割る。
// 文書は作り直さず、持つのは一覧だけ。探すのはプラグインが渡す関数（WordFinder。文字 → 言葉の見つかった所）で、読んだ文書の普通の文字（text）だけを探す
// （コード・既存のリンク・画像・脚注の参照の中は探さない。原文と同じ字の並びでない文字は、位置が決まらないので探さない）
import type { MarkdownBlock, MarkdownDocument, MarkdownInline } from "./parse"

// 見つかった所（文字の中の位置と長さ。target はプラグインが決める行き先で、押したときに返る）
export interface WordMatch {
  at: number
  length: number
  target: string
}

export type WordFinder = (text: string) => readonly WordMatch[]

// 原文の中での、リンクにする所
export type WordLink = WordMatch

// 文書の普通の文字から、リンクにする所を原文の位置で集める（原文の順）
export function wordLinksOf(document: MarkdownDocument, find: WordFinder): WordLink[] {
  const found: WordLink[] = []
  const inlines = (list: readonly MarkdownInline[]) => {
    for (const i of list) {
      if (i.kind === "text") {
        if (i.range.end - i.range.start !== i.value.length) continue
        for (const m of find(i.value)) found.push({ ...m, at: i.range.start + m.at })
      } else if (i.kind === "strong" || i.kind === "emphasis" || i.kind === "delete") inlines(i.children)
    }
  }
  const blocks = (list: readonly MarkdownBlock[]) => {
    for (const b of list) {
      switch (b.kind) {
        case "paragraph":
        case "heading":
          inlines(b.children)
          break
        case "blockquote":
          blocks(b.children)
          break
        case "list":
          for (const item of b.items) blocks(item.children)
          break
        case "table":
          for (const c of [...b.head, ...b.body.flat()]) inlines(c.children)
          break
        default:
          break
      }
    }
  }
  blocks(document.blocks)
  for (const f of document.footnotes) blocks(f.children)
  return found.sort((a, b) => a.at - b.at)
}

// 文字を、リンクにする所で割った片（text はただの字、link はリンク。at は文字の中の位置）
export type WordPiece =
  | { kind: "text"; text: string; at: number }
  | { kind: "link"; text: string; at: number; target: string }

// 文字 text（links の at は、text の頭を 0 とした位置。重ならず、text の中に収まる物だけ）を片に割る。リンクの無い文字は 1 片で返す
export function splitWords(text: string, links: readonly WordMatch[]): WordPiece[] {
  const pieces: WordPiece[] = []
  let from = 0
  for (const l of links) {
    if (l.at < from || l.at + l.length > text.length || l.length <= 0) continue
    if (l.at > from) pieces.push({ kind: "text", text: text.slice(from, l.at), at: from })
    pieces.push({ kind: "link", text: text.slice(l.at, l.at + l.length), at: l.at, target: l.target })
    from = l.at + l.length
  }
  if (from < text.length || pieces.length === 0) pieces.push({ kind: "text", text: text.slice(from), at: from })
  return pieces
}
