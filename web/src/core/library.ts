// ブックの一覧: ブックを id ごとに持つ。表にある 1 冊だけのタイプのブックはいつもある。
// 一覧が対象のアクションには、ゴミ箱のブック（trashed のあるブック）も入れて渡す
import type { Book } from "./schema/book"

export type Library = Readonly<Record<string, Book>>

// 一覧を、開けるブックとゴミ箱のブックに分ける
export function splitTrash(library: Library): { books: Library; trash: Library } {
  const books: Record<string, Book> = {}
  const trash: Record<string, Book> = {}
  for (const b of Object.values(library)) (b.trashed === undefined ? books : trash)[b.id] = b
  return { books, trash }
}
