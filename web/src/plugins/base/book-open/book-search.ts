// ブックを名前（bookTitle）で探す。空白で区切った言葉が全部含まれるブックを、並びを変えずに返す（言葉が無ければ全部）。
// 全角と半角、大文字と小文字は区別しない
import { bookTitle } from "../../../core/book"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { Lang } from "../../../core/i18n/i18n"
import type { Book } from "../../../core/schema/book"

const normalize = (s: string) => s.normalize("NFKC").toLowerCase()

// 名前が、空白で区切った言葉を全部含むか（言葉が無ければ含む）
export function matchesQuery(title: string, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  const t = normalize(title)
  return words.every(w => t.includes(w))
}

export function searchBooks(catalog: CoreCatalog, books: readonly Book[], query: string, lang: Lang): Book[] {
  return books.filter(b => matchesQuery(bookTitle(catalog, b, lang), query))
}
