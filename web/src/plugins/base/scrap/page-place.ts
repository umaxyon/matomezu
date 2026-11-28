// ページの名前と、それを入れている物の名前（スクラップトレイの行と、使っている所の一覧で、ページを「ブック › ページ」と呼ぶため）
import { type Naming, titleOf } from "../../../core/entries"
import type { Library } from "../../../core/folders"
import type { StageEntry } from "../../../core/folders-tree"
import { openablePageRow } from "../../../core/library"

// 開けるページ page の名前 title と、それを入れているブックかブックの外のバインダ within（ブックの外のページ 1 枚なら無し）。開けなければ undefined。
// フォルダの表とページメタで答える（ページの中身を持っていなくても）
export function pagePlaceOf(
  from: Library,
  page: string,
  naming: Naming,
): { title: string; within?: { entry: StageEntry; title: string } } | undefined {
  const at = openablePageRow(from, page)
  if (!at) return undefined
  const { outermost, row } = at
  const role = from.folders[outermost.id]?.folderRole
  const within = role === "book" || role === "binder" ? titleOf(from, "folder", outermost.id, naming) : undefined
  return within === undefined ? { title: row.title } : { title: row.title, within: { entry: outermost, title: within } }
}
