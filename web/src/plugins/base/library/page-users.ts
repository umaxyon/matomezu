// 完全に消す前の確かめに出す、消えるページを使っている所（スクラップで指しているページ）の行。使っている所は常駐が引き（インスタンスの pageUsers）、名前は画面の書庫から付ける
import { type Naming, rowsWithin, titleOf } from "../../../core/entries"
import type { Folders } from "../../../core/folders"
import { foldersOver } from "../../../core/folders-tree"
import type { LibraryAndBooks } from "../../../core/library"
import type { PageUsers } from "../../../core/page-users"
import { pagePlaceOf } from "../scrap/page-place"

// 完全に消すゴミ箱の直下の物 entries の中のページの id（ページならそのもの、フォルダ・ブック・バインダなら何段下でも中の全部のページ。参照エントリはページを持たない）
export const pagesPurgedWith = (folders: Folders, entries: readonly { id: string; kind: string }[]): string[] =>
  entries.flatMap(e => (e.kind === "page" ? [e.id] : e.kind === "reference" ? [] : rowsWithin(folders, e.id).pages))

// 使っている所の 1 行: 消えるページの名前 target と、使っているページの名前 page。within は、使っているページを入れているブックかブックの外のバインダの名前と、
// それがバックヤードに在れば、そのバックヤードの名前（backyard）
export interface PageUseLine {
  target: string
  page: string
  within?: { title: string; backyard?: string }
}

// 常駐の答え users を、消えるページの順（targets）に、使っている所の行にする（画面の書庫に無いページは飛ばす）
export function pageUseLinesOf(
  from: LibraryAndBooks,
  targets: readonly string[],
  users: PageUsers,
  naming: Naming,
): PageUseLine[] {
  return targets.flatMap(target =>
    (users.users[target] ?? []).flatMap((user): PageUseLine[] => {
      const at = pagePlaceOf(from, user, naming)
      if (!at) return []
      const title = titleOf(from, "page", target, naming) ?? target
      if (!at.within) return [{ target: title, page: at.title }]
      const backyard = foldersOver(from.folders, at.within.entry.id).find(f => f.folderRole === "backyard")
      const yard = backyard ? titleOf(from, "folder", backyard.id, naming) : undefined
      return [
        { target: title, page: at.title, within: { title: at.within.title, ...(yard ? { backyard: yard } : {}) } },
      ]
    }),
  )
}
