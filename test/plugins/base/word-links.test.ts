// 文中の言葉をリンクにする（base/markdown/word-links.ts）: 読んだ文書の普通の文字だけを探し、原文の位置で一覧にする。文字を割る
import { expect, test } from "bun:test"
import { parseMarkdown, splitWords, type WordFinder, wordLinksOf } from "../../../web/src/plugins/base/markdown"

const find: WordFinder = text =>
  [...text.matchAll(/M-\d+/g)].map(m => ({ at: m.index, length: m[0].length, target: m[0] }))
const linksIn = (source: string) =>
  wordLinksOf(parseMarkdown(source), find).map(l => [source.slice(l.at, l.at + l.length), l.at])

test("段落・見出し・引用・リスト・表・強調の中の普通の文字から、原文の位置で見つける", () => {
  const source =
    "# M-1 見出し\n\n本文 M-2 と **強調 M-3** と *M-4*\n\n> 引用 M-5\n\n- 項目 M-6\n\n| a |\n|---|\n| M-7 |\n"
  expect(linksIn(source).map(([w]) => w)).toEqual(["M-1", "M-2", "M-3", "M-4", "M-5", "M-6", "M-7"])
  for (const [word, at] of linksIn(source)) expect(source.slice(at as number, (at as number) + 3)).toBe(word as string)
})

test("コードスパン・コードの塊・既存のリンク・画像の中は探さない", () => {
  const source = "`M-1` と [M-2](https://example.com) と ![M-3](x) と M-4\n\n```\nM-5\n```\n"
  expect(linksIn(source).map(([w]) => w)).toEqual(["M-4"])
})

test("原文と同じ字の並びでない文字（エスケープを含む物）は、位置が決まらないので、その文字の塊ごと探さない", () => {
  expect(linksIn("M\\-1 と M-2")).toEqual([])
})

test("文字を、リンクにする所で割る。リンクの無い文字は 1 片、重なる・はみ出す所は使わない", () => {
  expect(splitWords("a M-1 b", [{ at: 2, length: 3, target: "t" }])).toEqual([
    { kind: "text", text: "a ", at: 0 },
    { kind: "link", text: "M-1", at: 2, target: "t" },
    { kind: "text", text: " b", at: 5 },
  ])
  expect(splitWords("abc", [])).toEqual([{ kind: "text", text: "abc", at: 0 }])
  expect(splitWords("abc", [{ at: 2, length: 5, target: "t" }])).toEqual([{ kind: "text", text: "abc", at: 0 }])
})
