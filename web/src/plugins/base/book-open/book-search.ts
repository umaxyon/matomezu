import type { Book } from "../../../core/schema/book"

const normalize = (s: string) => s.normalize("NFKC").toLowerCase()

// 名前が、空白で区切った言葉を全部含むか（言葉が無ければ含む）
export function matchesQuery(title: string, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  const t = normalize(title)
  return words.every(w => t.includes(w))
}

export function searchBooks(
  books: readonly Book[],
  query: string,
  touched: Readonly<Record<string, string>> = {},
): Book[] {
  const at = (b: Book) => touched[b.id] ?? ""
  return books
    .filter(b => matchesQuery(b.title, query))
    .map((b, i) => ({ b, i }))
    .sort((x, y) => (at(x.b) === at(y.b) ? x.i - y.i : at(x.b) < at(y.b) ? 1 : -1))
    .map(x => x.b)
}
