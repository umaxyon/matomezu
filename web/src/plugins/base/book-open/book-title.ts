// 画面に出すブックの名前

import { bookType, type CoreCatalog } from "../../../core/core-catalog"
import { type Lang, translate } from "../../../core/i18n/i18n"
import type { Book } from "../../../core/schema/book"

// 画面に出すブックの名前。題名を持たないか空のブックは、タイプの名前で呼ぶ
export function bookTitle(catalog: CoreCatalog, book: Book, lang: Lang): string {
  return "title" in book && book.title.trim() !== ""
    ? book.title
    : translate(catalog.messages, lang, bookType(catalog, book.type).title)
}
