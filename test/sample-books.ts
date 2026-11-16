// 見本のブック（どれも、A4 横の図面のページが 1 つ）
import type { Book } from "../web/src/core/schema/book"
import { testBook } from "./lineup"

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

export const SAMPLE_BOOKS: Book[] = TITLES.map((title, i) => testBook(`b${i + 1}`, title))
