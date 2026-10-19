// 見本のブック（どれも 1 ページ）
import type { Book } from "../core/schema/book"

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

export const SAMPLE_BOOKS: Book[] = TITLES.map((title, i) => ({
  id: `b${i + 1}`,
  title,
  pages: [{ id: "p1", title: "ページ 1" }],
}))
