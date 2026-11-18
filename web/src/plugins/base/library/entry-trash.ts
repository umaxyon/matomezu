// ゴミ箱: 書庫ホームかフォルダの直下のエントリをゴミ箱に入れる entry-trash（入っていたフォルダから外し、ゴミ箱の並びへ入れる。フォルダとブックは中身ごと）、
// 戻す entry-restore（元いたフォルダへ。無ければ、その上のフォルダをたどる）、消す entry-purge と、ゴミ箱を空にする trash-empty（書庫から消す。戻せない）。
// 戻す・消す・空にするのは利用者だけ（userOnly）。ロック中のブック・ロック中のページを持つブックは（フォルダごとでも）、認可ステップ lock が止める
import { z } from "zod"
import {
  isMoveRefusal,
  removedEntry,
  restoredEntry,
  trashedEntry,
  trashRefOf,
  trashRefsOf,
} from "../../../core/entries"
import type { Folders, Library } from "../../../core/folders"
import type { Books } from "../../../core/library"
import type { Book } from "../../../core/schema/book"
import { kit } from "../kit"
import { numbered, placedInFolder, restoreTargetOf } from "./entries"

// ゴミ箱の直下のブックと、入れた時刻（新しい順）。trash はゴミ箱かその中のブック、folders は書庫のフォルダの行
export function trashOrder(trash: Books, folders: Folders): { book: Book; trashed: string }[] {
  return trashRefsOf(folders)
    .flatMap(r => {
      const book = trash[r.id]
      return book ? [{ book, trashed: r.trashed }] : []
    })
    .sort((a, b) => (a.trashed < b.trashed ? 1 : -1))
}

// ゴミ箱の直下のエントリ ids を書庫から消す（どれかがゴミ箱の直下に無ければ null）
function purged(library: Library, ids: readonly string[]): Library | null {
  let next = library
  for (const id of ids) {
    if (!trashRefOf(next.folders, id)) return null
    const done = removedEntry(next, id)
    if (isMoveRefusal(done)) return null
    next = done
  }
  return next
}

export const ENTRY_TRASH = kit.defineAction({
  id: "entry-trash",
  aiDescription: `Move an entry of the library (a book, a folder with everything in it, or a page or a binder that is not in a book) to the trash: entry is its id, and it must be directly in the library home or a folder (see read_folder). It leaves the library (list_books and read_folder no longer show it); only the user can bring it back or delete it for good. Refused for a book that is locked or has a locked page, also inside the folder (denied by ${kit.name("lock")}), and when a book it holds is shown on a screen now (open-on-screen: ask the user in the chat).`,
  title: "Move to trash",
  target: "library",
  // 中身ごと動かすので、中のブックのページを含む全部を変える（ロック中のページを持つブックも止める）
  permissionScope: { entry: "entry", where: "all-pages" },
  args: z.strictObject({ entry: z.string().min(1) }),
  run: (library, args, ctx) => {
    if (!placedInFolder(library.folders, args.entry)) return null
    const next = trashedEntry(library, args.entry, ctx.now)
    return isMoveRefusal(next) ? null : { next, result: {} }
  },
})

export const ENTRY_RESTORE = kit.defineAction({
  id: "entry-restore",
  aiDescription:
    "Bring an entry back from the trash, to the folder it was in (or the nearest folder above that still exists). Only the user can do this.",
  title: "Restore",
  target: "library",
  userOnly: true,
  permissionScope: { entry: "entry", where: "all-pages" },
  // onConflict: 戻す先に同じ名前の物が在るとき、断る（refuse）か、番号を付けた名前で戻す（number）
  args: z.strictObject({ entry: z.string().min(1), onConflict: z.enum(["refuse", "number"]).default("refuse") }),
  run: (library, args) => {
    const ref = trashRefOf(library.folders, args.entry)
    if (!ref) return null
    const into = restoreTargetOf(library.folders, ref.from)
    const back = restoredEntry(library, args.entry, into)
    if (isMoveRefusal(back)) return null
    const next = args.onConflict === "number" ? numbered(back, ref.kind, args.entry, into) : back
    return next ? { next, result: { into } } : null
  },
})

export const ENTRY_PURGE = kit.defineAction({
  id: "entry-purge",
  history: false, // 戻せない
  aiDescription: "Delete entries in the trash for good, with everything in them. Only the user can do this.",
  title: "Delete",
  target: "library",
  userOnly: true,
  permissionScope: { entries: "entries", where: "all-pages" },
  args: z.strictObject({ entries: z.array(z.string().min(1)).min(1) }),
  run: (library, args) => {
    const next = purged(library, args.entries)
    return next ? { next, result: {} } : null
  },
})

export const TRASH_EMPTY = kit.defineAction({
  id: "trash-empty",
  history: false, // 戻せない
  aiDescription: "Delete everything in the trash for good. Only the user can do this.",
  title: "Empty trash",
  target: "library",
  userOnly: true,
  permissionScope: "unknown", // 何を消すかは、行う前の引数からは言えない
  args: z.strictObject({}),
  run: library => {
    const next = purged(
      library,
      trashRefsOf(library.folders).map(r => r.id),
    )
    return next ? { next, result: {} } : null
  },
})
