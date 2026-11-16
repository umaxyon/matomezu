// 見本のブック（どれも、A4 横の図面のページが 1 つ。ページの id はブックをまたいで重ならない: b1 は p1、ほかは b2-p1 のようにブックの id を頭に付ける）
import type { Book } from "../web/src/core/schema/book"
import { drawingPage, testBook } from "./lineup"

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

// 見本のブック book のページの id
export const samplePage = (book: string): string => (book === "b1" ? "p1" : `${book}-p1`)

export const SAMPLE_BOOKS: Book[] = TITLES.map((title, i) =>
  testBook(`b${i + 1}`, title, [drawingPage(samplePage(`b${i + 1}`))]),
)
