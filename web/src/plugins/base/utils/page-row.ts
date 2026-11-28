// 名前とタイプだけを読む所（スクラップトレイの行・ワーカーブックのページの一覧）のための、ページの表の行の引き方: 中身を持っていない、ページメタだけの行でもよい

import type { Library, PageRow } from "../../../core/folders"
import { atOutsidePagePlace, inTrash, NO_OUTERMOST, outermostOf, type StageEntry } from "../../../core/folders-tree"

// id のページの表の行を、openablePage（core/library.ts）と同じ決まりで、ページとフォルダの表だけから引く。ゴミ箱の中・並びの行がそろわない物・無いページは undefined
export function openablePageRow(from: Library, id: string): { outermost: StageEntry; row: PageRow } | undefined {
  const outermost = outermostOf(from, id)
  const row = from.pages[id]
  if (outermost === NO_OUTERMOST || !row) return undefined
  const opens =
    outermost.kind === "page"
      ? atOutsidePagePlace(from.folders, id)
      : !inTrash(from.folders, outermost.id) && rowsAllIn(from, outermost.id)
  return opens ? { outermost, row } : undefined
}

// ブックかバインダ id の並びのエントリ（バインダの中のページも）の行が、全部表に在るか（ページメタだけの行でもよい）
function rowsAllIn({ pages, folders }: Library, id: string): boolean {
  const folder = folders[id]
  if (folder?.folderRole !== "book" && folder?.folderRole !== "binder") return false
  return folder.lineup.every(
    r =>
      r.kind === "reference" ||
      r.id in pages ||
      (folders[r.id]?.folderRole === "binder" && rowsAllIn({ pages, folders }, r.id)),
  )
}
