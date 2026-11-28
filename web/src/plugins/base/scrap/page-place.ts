// ページの名前と、それを入れている物の名前（スクラップトレイの行と、使っている所の一覧で、ページを「ブック › ページ」と呼ぶため）
import type { StageEntry } from "../../../core/folders-tree"
import { type LibraryAndBooks, openablePage } from "../../../core/library"

// 開けるページ page の名前 title と、それを入れているブックかブックの外のバインダ within（ブックの外のページ 1 枚なら無し）。開けなければ undefined
export function pagePlaceOf(
  from: LibraryAndBooks,
  page: string,
): { title: string; within?: { entry: StageEntry; title: string } } | undefined {
  const at = openablePage(from, page)
  if (!at) return undefined
  const row = from.folders[at.outermost.id]
  return row?.folderRole === "book" || row?.folderRole === "binder"
    ? { title: at.page.title, within: { entry: at.outermost, title: row.title } }
    : { title: at.page.title }
}
