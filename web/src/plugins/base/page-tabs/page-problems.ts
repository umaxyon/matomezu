// ページの問題: ブックのタイプが、ページを見て問題（ツリーが紙に入らないなど）を知らせる（定義オブジェクトの拡張ポイントに書き足す）。
// base のアクション page-add・page-update・book-update は、書いたあとのページ（book-update は全部のページ）に問題があれば断る。
// 断ったことを利用者に知らせるか、どう知らせるかは呼んだ側が決める（問題の文言は任意。base のダイアログは、文言があればダイアログの中に出す）
import { hasPages } from "../../../core/book"
import { bookType, type CoreCatalog } from "../../../core/core-catalog"
import type { MessageKey } from "../../../core/i18n/i18n"
import type { ItemPage } from "../../../core/placed"
import type { Book } from "../../../core/schema/book"
import { settingsAt } from "../book-settings"

export interface PageProblem {
  message?: MessageKey
}

declare module "../../../core/catalog" {
  interface BookTypeExtras {
    // page で効いている設定の値は setting で読む（ブックとページの設定の項目を、ページ → ブック → 既定の順に）
    pageProblem?(catalog: CoreCatalog, page: ItemPage, setting: (id: string) => unknown): PageProblem | null
  }
}

// ブック book のページ（pages に id を書けばそのページだけ）のうち、問題のあるものと、その問題
export function pageProblems(
  catalog: CoreCatalog,
  book: Book,
  pages?: readonly string[],
): { page: ItemPage; problem: PageProblem }[] {
  const check = bookType(catalog, book.type).pageProblem
  if (!check || !hasPages(book)) return []
  return book.pages.flatMap(page => {
    if (pages && !pages.includes(page.id)) return []
    const problem = check(catalog, page, settingsAt(catalog, book, page))
    return problem ? [{ page, problem }] : []
  })
}
