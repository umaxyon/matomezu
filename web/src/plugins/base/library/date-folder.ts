// 日付フォルダ: 置くフォルダを言わずに作る物（page-create のページ・book-create のブック・folder-create のフォルダ）が入る、ドキュメントの直下の、名前がその日の日付（ctx.today。YYYY-MM-DD）のフォルダ。
// ふつうのフォルダで、名前で引く（印は持たない。名前を変えた・よそへ動かした・ゴミ箱へ入れたフォルダは、日付フォルダでなくなる）

import type { Library } from "../../../core/folders"
import { systemFolderOf } from "../../../core/folders-tree"
import { withNewFolder } from "./entries"
import { DOCUMENTS } from "./system-folders"

const documentsOf = ({ folders }: Library) => Object.values(folders).find(f => systemFolderOf(f) === DOCUMENTS.id)

// 書庫 library の、日付 today の日付フォルダの id（ドキュメントの直下の、名前が today のフォルダ。無ければ undefined）
export function dateFolderIn(library: Library, today: string): string | undefined {
  return documentsOf(library)?.lineup.find(r => {
    const row = r.kind === "folder" ? library.folders[r.id] : undefined
    return row?.folderRole === "folder" && row.title === today
  })?.id
}

// 書庫 library に、日付 today の日付フォルダが無ければ、id がその id のフォルダをドキュメントの先頭に足した書庫と、日付フォルダの id（在れば、書庫はそのまま）。
// ドキュメントが無い・足せなければ null
export function withDateFolder(
  library: Library,
  today: string,
  id: string,
): { library: Library; folder: string } | null {
  const found = dateFolderIn(library, today)
  if (found !== undefined) return { library, folder: found }
  const documents = documentsOf(library)
  const next = documents && withNewFolder(library, id, today, documents.id, 0)
  return next ? { library: next, folder: id } : null
}
