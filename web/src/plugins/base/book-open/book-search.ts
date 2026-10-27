// ブックを名前（bookTitle）で探す。空白で区切った言葉が全部含まれるブックを返す（言葉が無ければ全部）。
// 全角と半角、大文字と小文字は区別しない。並びは触れた（開いたか書いた）時刻の新しい順で、時刻の無いブックは後ろに元の並びのまま
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

export function searchBooks(
  catalog: CoreCatalog,
  books: readonly Book[],
  query: string,
  lang: Lang,
  touched: Readonly<Record<string, string>> = {},
): Book[] {
  const at = (b: Book) => touched[b.id] ?? ""
  return books
    .filter(b => matchesQuery(bookTitle(catalog, b, lang), query))
    .map((b, i) => ({ b, i }))
    .sort((x, y) => (at(x.b) === at(y.b) ? x.i - y.i : at(x.b) < at(y.b) ? 1 : -1))
    .map(x => x.b)
}
