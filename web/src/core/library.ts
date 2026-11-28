// ブックを id ごとに持つ値（書庫から組んだブック）

import { findPage, foundPage } from "./book"
import type { Library, PageRow } from "./folders"
import { libraryOf, readableIn } from "./folders-books"
import {
  atOutsidePagePlace,
  inTrash,
  NO_OUTERMOST,
  outermostOf,
  outsideBinderIn,
  outsidePageIn,
  type StageEntry,
} from "./folders-tree"
import type { ItemPage } from "./placed"
import type { Book } from "./schema/book"

export type Books = Readonly<Record<string, Book>>

// 開けるブックの一覧 books と、ページとフォルダの表（ブックの外のページは、表から引く）
export interface LibraryAndBooks extends Library {
  books: Books
}

// id のページを、ステージで開ける所から引く: そのページと、それを開くステージエントリ（ブックの中ならそのブック、ブックの外のバインダの中ならそのバインダ、
// ブックの外のページ 1 枚ならそのページ自身）。ゴミ箱の中・読めない物・無いページは undefined
export function openablePage(from: LibraryAndBooks, id: string): { outermost: StageEntry; page: ItemPage } | undefined {
  const outermost = outermostOf(from, id)
  if (outermost === NO_OUTERMOST) return undefined
  const book = outermost.kind === "book" ? from.books[outermost.id] : undefined
  const page =
    outermost.kind === "book"
      ? book && foundPage(findPage(book, id))
      : outermost.kind === "page"
        ? outsidePageIn(from, id)
        : outsideBinderIn(from, outermost.id)?.lineup.find(p => p.id === id)
  return page && { outermost, page }
}

// id のページの表の行を、openablePage と同じ決まりで、ページとフォルダの表だけから引く（中身を持っていない、ページメタだけの行でもよい。
// 名前とタイプだけを読む所のため）。ゴミ箱の中・読めない物・無いページは undefined
export function openablePageRow(from: Library, id: string): { outermost: StageEntry; row: PageRow } | undefined {
  const outermost = outermostOf(from, id)
  const row = from.pages[id]
  if (outermost === NO_OUTERMOST || !row) return undefined
  const opens =
    outermost.kind === "page"
      ? atOutsidePagePlace(from.folders, id)
      : !inTrash(from.folders, outermost.id) && readableIn(from, outermost.id)
  return opens ? { outermost, row } : undefined
}

// 書庫 library のブックを、開けるブックと、ゴミ箱かその中のブックに分ける
export function splitTrash(library: Library): { books: Books; trash: Books } {
  const books: Record<string, Book> = {}
  const trash: Record<string, Book> = {}
  for (const b of Object.values(libraryOf(library))) (inTrash(library.folders, b.id) ? trash : books)[b.id] = b
  return { books, trash }
}
