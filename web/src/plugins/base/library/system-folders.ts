// システムフォルダ: base のドキュメントと、足りないシステムフォルダの行を足すアクション system-folder-add。
// system-folder-add は、機能台帳に定義が在って、ゴミ箱の外に行が無いシステムフォルダごとに、空の行を書庫ホームの先頭（印の順の所）に足す。
// 書庫ホームの直下のシステムフォルダ（足した物と、プラグインが戻って名前がまた引けるようになった物）の名前が、そこのほかの物と当たれば、ほかの物の名前に番号を付ける（「ドキュメント 2」）。常駐が、起動したとき・機能台帳が変わったとき・データを書いて機能台帳に合わなくなった（足りない・名前が重なる）ときに、利用者として行う（runAndKeepsWithCatalog）
import { z } from "zod"
import { freeTitle } from "../../../core/book"
import type { CoreCatalog } from "../../../core/core-catalog"
import {
  type EntryKind,
  missingSystemFolders,
  type Naming,
  sameTitledAsSystemFolder,
  titleOf,
  titlesIn,
} from "../../../core/entries"
import {
  type Folder,
  HOME_ID,
  type Library,
  type PlainFolder,
  systemFolderIndex,
  systemFolderOf,
} from "../../../core/folders"
import { kit } from "../kit"
import { retitled } from "./entries"

export const DOCUMENTS = kit.defineSystemFolder({
  id: "documents",
  title: "Documents",
  aiDescription: "The documents folder: a folder that is always at the top of the library home.",
})

// 足したシステムフォルダ 1 つ: 行の id と印
export interface AddedSystemFolder {
  folder: string
  systemFolder: string
}
// 名前に番号を付けた物 1 つ: エントリの id・種類と、前の名前・新しい名前
export interface RenamedEntry {
  entry: string
  kind: EntryKind
  from: string
  to: string
}
export interface SystemFoldersAdded {
  added: readonly AddedSystemFolder[]
  renamed: readonly RenamedEntry[]
}

// 書庫 library に、足りないシステムフォルダの行を足し、名前の当たる物に番号を付けた書庫と、足した物・番号を付けた物（純粋。同じ入力なら同じ結果）。
// 行の id は newId で振る（書庫に在る id なら null）。名前は naming で引く
export function withSystemFolders(
  library: Library,
  catalog: CoreCatalog,
  naming: Naming,
  newId: () => string,
): { next: Library; result: SystemFoldersAdded } | null {
  const missing = missingSystemFolders(library, catalog)
  let next = library
  const added: AddedSystemFolder[] = []
  for (const mark of missing) {
    const id = newId()
    if (id in next.folders || id in next.pages) return null
    const home = next.folders[HOME_ID]
    if (!home) return null
    const at = systemFolderIndex(next.folders, mark)
    const row: PlainFolder = { folderRole: "folder", id, systemFolder: mark, lineup: [] }
    const lineup = [...home.lineup.slice(0, at), { kind: "folder" as const, id }, ...home.lineup.slice(at)]
    next = { pages: next.pages, folders: { ...next.folders, [id]: row, [HOME_ID]: { ...home, lineup } as Folder } }
    added.push({ folder: id, systemFolder: mark })
  }
  // 足した物と、プラグインが戻って名前がまた引けるようになった物（書庫ホームの直下のシステムフォルダの全部）の名前に、当たる物へ番号を付ける
  const renamed: RenamedEntry[] = []
  const marked = (next.folders[HOME_ID]?.lineup ?? []).filter(r => systemFolderOf(next.folders[r.id]) !== undefined)
  for (const { id: folder } of marked) {
    const title = titleOf(next, "folder", folder, naming)
    for (const r of sameTitledAsSystemFolder(next, folder, naming)) {
      const home = next.folders[HOME_ID]
      if (title === undefined || !home) return null
      const to = freeTitle(title, titlesIn(next, home, naming, r.id))
      const done = retitled(next, r.kind, r.id, to, naming)
      if (!done) return null
      next = done
      renamed.push({ entry: r.id, kind: r.kind, from: title, to })
    }
  }
  return { next, result: { added, renamed } }
}

export const SYSTEM_FOLDER_ADD = kit.defineAction({
  id: "system-folder-add",
  title: "Add system folders",
  aiDescription:
    "Add the system folders that the library lacks (such as Documents) at the top of the library home, numbering the titles of entries there that have the same title. matomezu does this by itself; only the user can do this.",
  target: "library",
  userOnly: true,
  history: false, // 利用者の操作でなく、機能台帳に合わせて足す
  runAndKeepsWithCatalog: true,
  permissionScope: "unknown", // 番号を付ける物は、行うまで分からない
  args: z.strictObject({}),
  run: (library, _args, ctx) => withSystemFolders(library, ctx.catalog, ctx.naming, ctx.newId),
})
