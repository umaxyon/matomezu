// ページの問題: ページのタイプが、ページを見て問題（ツリーが紙に入らないなど）を知らせる（定義オブジェクトの拡張ポイントに書き足す）。
// base のアクション page-add・page-update・pages-update は、書いたあとのページに問題があれば断る。
// 断ったことを利用者に知らせるか、どう知らせるかは呼んだ側が決める（問題の文言は任意。base のダイアログは、文言があればダイアログの中に出す）
import { pagesOf } from "../../../core/book"
import { type CoreCatalog, pageType } from "../../../core/core-catalog"
import type { MessageKey } from "../../../core/i18n/i18n"
import type { ItemPage } from "../../../core/placed"
import type { StageLineup } from "../../../core/schema/book"
import { type SettingReader, settingsAt } from "../book-settings"
import { type GrowSides, growOf } from "../place/grow"

export interface PageProblem {
  message?: MessageKey
}

declare module "../../../core/catalog" {
  interface PageTypeExtras {
    // page で効いている設定の値は setting で読む（ページの設定の項目を、ページ → 既定の順に）。
    // grow はページの増やす向き（可変ページでなければ undefined。place/grow の growOf）
    pageProblem?(
      catalog: CoreCatalog,
      page: ItemPage,
      setting: SettingReader,
      grow: GrowSides | undefined,
    ): PageProblem | null
  }
}

// ブック book のページ（pages に id を書けばそのページだけ）のうち、問題のあるものと、その問題（問題は、ページのタイプが知らせる）
export function pageProblems(
  catalog: CoreCatalog,
  book: StageLineup,
  pages?: readonly string[],
): { page: ItemPage; problem: PageProblem }[] {
  return pagesOf(book).flatMap(page => {
    if (pages && !pages.includes(page.id)) return []
    const problem = pageProblem(catalog, page)
    return problem ? [{ page, problem }] : []
  })
}

// ページ page の問題（ページのタイプが知らせる。無ければ null）
export function pageProblem(catalog: CoreCatalog, page: ItemPage): PageProblem | null {
  return (
    pageType(catalog, page.type).pageProblem?.(catalog, page, settingsAt(catalog, page), growOf(catalog, page)) ?? null
  )
}
