import { drawingPage, testBook } from "../test/lineup"

// e2e が初めに置くブック: 図面のブック 8 冊（どれも A4 横のページが 1 つ）。テストは、置く前にホストを空にして、これを置き直す
const TITLES = [
  "まとめ図の構想",
  "画面の構成",
  "残課題",
  "週次の振り返り",
  "API の一覧",
  "データの形",
  "配布の手順",
  "Design Notes",
]

export const E2E_BOOKS = TITLES.map((title, i) => testBook(`b${i + 1}`, title, [drawingPage("p1")]))

// 読んだブック（JSON）の並びのページ（フォルダの中も、並びの順に）
type Entry = { kind: string; id: string; lineup?: readonly Entry[] } & Record<string, unknown>
export const pagesIn = <P = Entry>(book: { lineup: readonly unknown[] }): P[] =>
  (book.lineup as readonly Entry[]).flatMap(e => (e.kind === "folder" ? (e.lineup ?? []) : [e])) as P[]

// 読んだブック（JSON）の、id のページ
export const pageIn = <P = Entry>(book: { lineup: readonly unknown[] }, id: string): P | undefined =>
  pagesIn<P & { id: string }>(book).find(p => p.id === id)
