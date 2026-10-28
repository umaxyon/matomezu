// ブックをゴミ箱に入れる: アクション book-trash（一覧から外す。外したブックは、ホストがゴミ箱に入れた時刻と残す）。
// 1 冊だけのタイプのブックと、無いブックは断る。ロック中のブック・ロック中のページを持つブックは、core の perform が断る（locked）
import { z } from "zod"
import { hasPages } from "../../../core/book"
import { bookType, type CoreCatalog } from "../../../core/core-catalog"
import { type Lang, translate } from "../../../core/i18n/i18n"
import type { Book } from "../../../core/schema/book"
import type { TrashEntry } from "../../../store/store"
import { kit } from "../kit"

// ブックをゴミ箱に入れられるか: 1 冊だけのタイプでなく、ブックにもページにもロックが掛かっていない
export const trashable = (catalog: CoreCatalog, book: Book): boolean =>
  !bookType(catalog, book.type).single &&
  book.locked !== true &&
  !(hasPages(book) && book.pages.some(p => p.locked === true))

// ゴミ箱のブックの呼び名: 名前が空ならタイプの名前（タイプが機能台帳に無ければ null）
export function trashTitle(catalog: CoreCatalog, entry: TrashEntry, lang: Lang): string | null {
  if (entry.title.trim() !== "") return entry.title
  const type = catalog.bookTypes.get(entry.type)
  return type ? translate(catalog.messages, lang, type.title) : null
}

export const BOOK_TRASH = kit.defineAction({
  id: "book-trash",
  aiDescription:
    "Move a book to the trash: it leaves the list of books (list_books no longer shows it); only the user can bring it back or delete it for good. Refused for a book type that has only one book, for a book that is locked or has a locked page (locked), and for a book shown on a screen now (open-on-screen: ask the user in the chat).",
  title: "Move to trash",
  target: "library",
  args: z.strictObject({ book: z.string().min(1) }),
  run: (library, args, ctx) => {
    const book = library[args.book]
    if (!book || bookType(ctx.catalog, book.type).single) return null
    const { [args.book]: _, ...rest } = library
    return { next: rest, result: {} }
  },
})
