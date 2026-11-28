// ページの名前と、それを入れている物の名前（スクラップトレイの行と、使っている所の一覧で、ページを「ブック › ページ」と呼ぶため）
import { type Naming, titleOf } from "../../../core/entries"
import type { Library } from "../../../core/folders"
import { NO_OUTERMOST, outermostOf, type StageEntry } from "../../../core/folders-tree"

// 開けるページ page の名前 title と、それを入れているブックかブックの外のバインダ within（ブックの外のページ 1 枚なら無し）。開けなければ undefined。
// フォルダの表とページメタで答える（ページの中身を持っていなくても）
export function pagePlaceOf(
  from: Library,
  page: string,
  naming: Naming,
): { title: string; within?: { entry: StageEntry; title: string } } | undefined {
  const outermost = outermostOf(from, page)
  const row = from.pages[page]
  if (outermost === NO_OUTERMOST || !row) return undefined
  const role = from.folders[outermost.id]?.folderRole
  const within = role === "book" || role === "binder" ? titleOf(from, "folder", outermost.id, naming) : undefined
  return within === undefined ? { title: row.title } : { title: row.title, within: { entry: outermost, title: within } }
}
