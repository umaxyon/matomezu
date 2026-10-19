// ブックを題名で探す。空白で区切った言葉が全部含まれるブックを、並びを変えずに返す（言葉が無ければ全部）。
// 全角と半角、大文字と小文字は区別しない
import type { Book } from "./schema/book"

const normalize = (s: string) => s.normalize("NFKC").toLowerCase()

export function searchBooks(books: readonly Book[], query: string): Book[] {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...books]
  return books.filter(b => {
    const title = normalize(b.title)
    return words.every(w => title.includes(w))
  })
}
