// その日の入れ先: 置くフォルダを言わずに作る物（page-create のページ・book-create のブック）が入る、ドキュメントの直下の、名前がその日の日付（ctx.today。YYYY-MM-DD）のフォルダ。
// ふつうのフォルダで、名前で引く（印は持たない。名前を変えた・よそへ動かした・ゴミ箱へ入れたフォルダは、その日の入れ先でなくなる）

import type { Library } from "../../../core/folders"
import { systemFolderOf } from "../../../core/folders-tree"
import { withNewFolder } from "./entries"
import { DOCUMENTS } from "./system-folders"

// 書庫 library の、日付 today の入れ先のフォルダの id（ドキュメントの直下の、名前が today のフォルダ。無ければ undefined）
export function todayFolderIn({ folders }: Library, today: string): string | undefined {
  const documents = Object.values(folders).find(f => systemFolderOf(f) === DOCUMENTS.id)
  return documents?.lineup.find(r => {
    const row = r.kind === "folder" ? folders[r.id] : undefined
    return row?.folderRole === "folder" && row.title === today
  })?.id
}

// 書庫 library に、日付 today の入れ先のフォルダが無ければ、id がその id のフォルダをドキュメントの先頭に足した書庫と、入れ先の id（在れば、書庫はそのまま）。
// ドキュメントが無い・足せなければ null
export function withTodayFolder(
  library: Library,
  today: string,
  id: string,
): { library: Library; folder: string } | null {
  const found = todayFolderIn(library, today)
  if (found !== undefined) return { library, folder: found }
  const documents = Object.values(library.folders).find(f => systemFolderOf(f) === DOCUMENTS.id)
  const next = documents && withNewFolder(library, id, today, documents.id, 0)
  return next ? { library: next, folder: id } : null
}
