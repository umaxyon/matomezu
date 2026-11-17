// ブックを id ごとに持つ値（書庫から組んだブック）
import { inTrash, type Library, libraryOf } from "./folders"
import type { Book } from "./schema/book"

export type Books = Readonly<Record<string, Book>>

// 書庫 library のブックを、開けるブックと、ゴミ箱かその中のブックに分ける
export function splitTrash(library: Library): { books: Books; trash: Books } {
  const books: Record<string, Book> = {}
  const trash: Record<string, Book> = {}
  for (const b of Object.values(libraryOf(library))) (inTrash(library.folders, b.id) ? trash : books)[b.id] = b
  return { books, trash }
}
