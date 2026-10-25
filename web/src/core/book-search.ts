// ブックを名前（bookTitle）で探す。空白で区切った言葉が全部含まれるブックを、並びを変えずに返す（言葉が無ければ全部）。
// 全角と半角、大文字と小文字は区別しない
import { bookTitle } from "./book"
import type { CoreCatalog } from "./core-catalog"
import type { Lang } from "./i18n/i18n"
import type { Book } from "./schema/book"

const normalize = (s: string) => s.normalize("NFKC").toLowerCase()

export function searchBooks(catalog: CoreCatalog, books: readonly Book[], query: string, lang: Lang): Book[] {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...books]
  return books.filter(b => {
    const title = normalize(bookTitle(catalog, b, lang))
    return words.every(w => title.includes(w))
  })
}
