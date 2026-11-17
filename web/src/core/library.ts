// ブックを id ごとに持つ値（書庫から組んだブックの全部。ゴミ箱のブックも入る）
import type { Book } from "./schema/book"

export type Books = Readonly<Record<string, Book>>

// ブック all を、開けるブックとゴミ箱のブックに分ける
export function splitTrash(all: Books): { books: Books; trash: Books } {
  const books: Record<string, Book> = {}
  const trash: Record<string, Book> = {}
  for (const b of Object.values(all)) (b.trashed === undefined ? books : trash)[b.id] = b
  return { books, trash }
}
