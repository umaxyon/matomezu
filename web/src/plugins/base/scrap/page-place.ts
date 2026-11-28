// ページの名前と、それを入れている物の名前（スクラップトレイの行と、使っている所の一覧で、ページを「ブック › ページ」と呼ぶため）
import { type Naming, titleOf } from "../../../core/entries"
import type { StageEntry } from "../../../core/folders-tree"
import { type LibraryAndBooks, openablePage } from "../../../core/library"

// 開けるページ page の名前 title と、それを入れているブックかブックの外のバインダ within（ブックの外のページ 1 枚なら無し）。開けなければ undefined
export function pagePlaceOf(
  from: LibraryAndBooks,
  page: string,
  naming: Naming,
): { title: string; within?: { entry: StageEntry; title: string } } | undefined {
  const at = openablePage(from, page)
  if (!at) return undefined
  const role = from.folders[at.outermost.id]?.folderRole
  const within = role === "book" || role === "binder" ? titleOf(from, "folder", at.outermost.id, naming) : undefined
  return within === undefined
    ? { title: at.page.title }
    : { title: at.page.title, within: { entry: at.outermost, title: within } }
}
