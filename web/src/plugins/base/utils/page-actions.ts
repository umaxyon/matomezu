// ページのタイプで使えるアクションの一覧（AI や一覧に並べるための読み方。決まりは土台の typeAllows と同じ）
import { type CoreCatalog, pageType } from "../../../core/core-catalog"
import { typeAllows } from "../../../core/inspect"
import type { Page } from "../../../core/schema/book"

// タイプ type のページで使えるアクション（表の並び）: タイプが選んだ物に付くアクションとタイプが足すアクションから、タイプが外すアクションを除く（inspect と同じ決まり）。
// ブック自身だけを変えるアクション（許可スコープが "book"）は、タイプでは決まらないので、タイプに依らない付く先（attach の books）だけで並べる
export function actionsOfPage(catalog: CoreCatalog, page: Pick<Page, "type">): readonly string[] {
  const t = pageType(catalog, page.type)
  return [...catalog.actions.values()]
    .filter(a => (a.target === "book" && a.permissionScope === "book" ? a.attach?.books === true : typeAllows(a, t)))
    .map(a => a.id)
}
