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

export const E2E_BOOKS = TITLES.map((title, i) => ({
  type: "@matomezu/drawing:drawing",
  id: `b${i + 1}`,
  title,
  pages: [{ id: "p1", title: "ページ 1", paper: "@matomezu/base:a4", orientation: "landscape" }],
}))
