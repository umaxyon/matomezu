// 画面に出すブックの名前

import type { CoreCatalog } from "../../../core/core-catalog"
import type { Lang } from "../../../core/i18n/i18n"
import type { Book } from "../../../core/schema/book"

// 画面に出すブックの名前（ブックの題は 1 字以上）
export function bookTitle(_catalog: CoreCatalog, book: Book, _lang: Lang): string {
  return book.title
}
