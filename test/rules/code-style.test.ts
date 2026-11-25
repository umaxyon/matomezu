// 「コードの書き方」の決まりを見張る: コメントの言葉、データとビュー、文言、使う技術
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { basename, join } from "node:path"
import { crateOf, filesEnding, filesUnder, ROOT, relative, SRC, sources } from "./sources"

// コメントの言葉を見張るファイル（ソース・テスト・e2e・スクリプト・CSS・Go。このファイルは除く）
const wordedFiles = () =>
  [
    ...sources,
    ...filesUnder(join(ROOT, "test")),
    ...filesUnder(join(ROOT, "e2e")),
    ...filesUnder(join(ROOT, "scripts")),
    ...filesEnding(SRC, ".css"),
    ...["cmd", "internal", "web"].flatMap(d => filesEnding(join(ROOT, d), ".go")),
  ]
    .map(f => (typeof f === "string" ? { rel: relative(ROOT, f), text: readFileSync(f, "utf8") } : f))
    .filter(f => f.rel !== "test/rules/code-style.test.ts")

test("ソースに、その時の状況でしか意味を持たない言葉を書かない", () => {
  const words = /新基盤|オーバーホール|仮の|とりあえず|暫定|旧版|前の作り|今まで通り|今までどおり/
  // 決まりはコメントのもの。画面に出す文言で、その言葉を使うと決めたものは見ない
  const shown: string[] = []
  const withoutShown = (text: string) => shown.reduce((t, s) => t.replaceAll(s, ""), text)
  expect(
    wordedFiles()
      .filter(f => words.test(withoutShown(f.text)))
      .map(f => f.rel),
  ).toEqual([])
})

// 用語集の「使わない言葉」のうち、ふつうの文には出てこない物だけを見る
test("ソースに、用語集で使わないと決めた言葉を書かない", () => {
  const words = /キーの割り当て|型の表|登録表|欄|目録|見る人/
  expect(
    wordedFiles()
      .filter(f => words.test(f.text))
      .map(f => f.rel),
  ).toEqual([])
})

// Chromium は、要素に scrollbar-width・scrollbar-color があると ::-webkit-scrollbar を使わないので、それを書くと全体の細いバー（base/scrollbar）が黙って外れる。
// 書いてよいのは全体の指定と、::-webkit-scrollbar の無いブラウザに向けた @supports の中で色だけを変える所
test("スクロールバーの太さと色の標準のプロパティは、全体の指定（base/scrollbar）と ::-webkit-scrollbar の無いブラウザ向けの @supports の中にだけ書く", () => {
  const outside = (text: string) => text.replace(/@supports not selector\(::-webkit-scrollbar\) \{[\s\S]*?\n\}/g, "")
  expect(
    filesEnding(SRC, ".css")
      .map(path => ({ rel: relative(SRC, path), text: readFileSync(path, "utf8") }))
      .filter(f => f.rel !== "plugins/base/scrollbar/scrollbar.module.css")
      .filter(f => /scrollbar-(width|color)\s*:/.test(outside(f.text)))
      .map(f => f.rel),
  ).toEqual([])
})

test("core のデータと同じ名前のコンポーネントは作らない（データ X のビューは XView）", () => {
  const dataNames = new Set(
    sources
      .filter(f => crateOf(f.rel) === "core")
      .map(f =>
        basename(f.rel)
          .replace(/\.tsx?$/, "")
          .toLowerCase(),
      ),
  )
  const views = sources.filter(f => (crateOf(f.rel) === "ui" || crateOf(f.rel) === "plugins") && f.rel.endsWith(".tsx"))
  const clashes = views.filter(f => dataNames.has(basename(f.rel, ".tsx").toLowerCase())).map(f => f.rel)
  expect(clashes).toEqual([])
})

// Def の title は文言の表の鍵（MessageKey の型が確かめる）なので除く
test("画面の文言は t() を通す（ui に日本語を直に書かない）", () => {
  const japanese = /[\u3040-\u30ff\u3400-\u9fff]/
  const offenders = sources
    .filter(f => crateOf(f.rel) === "ui" || (crateOf(f.rel) === "plugins" && f.rel.endsWith(".tsx")))
    .flatMap(f =>
      f.text
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .map((line, i) => ({
          line: line
            .replace(/\/\/.*$/, "")
            .replace(/\bt\("[^"]*"/g, "")
            .replace(/^\s*title: "[^"]*"/, ""),
          at: `${f.rel}:${i + 1}`,
        }))
        .filter(l => japanese.test(l.line))
        .map(l => l.at),
    )
  expect(offenders).toEqual([])
})
