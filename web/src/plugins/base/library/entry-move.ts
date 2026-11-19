// 書庫のエントリを動かす・名前を変える・フォルダを作る: entry-move は、書庫ホームかフォルダの直下のエントリを、別のフォルダ（か同じフォルダ）の何番目かへ動かす。
// entry-rename は、その名前を変える。folder-create は、フォルダを作る。どれも、エントリの中身は変えない。
// 同じフォルダの中に同じ名前は置けない（土台が title-taken で断る）。entry-move の onConflict が number なら、番号を付けた名前にして入れる
import { z } from "zod"
import type { LibraryTargets } from "../../../core/def/action"
import { isMoveRefusal, movedEntry, namingFor, placedEntry, titleOf } from "../../../core/entries"
import { HOME_ID, type PlainFolder } from "../../../core/folders"
import { kit } from "../kit"
import {
  holdsEntries,
  isNotOverwritten,
  movesInto,
  numbered,
  overwritten,
  placedOutsideTrash,
  REPLACES_NOTHING,
  retitled,
} from "./entries"

export const FOLDER_CREATE = kit.defineAction({
  id: "folder-create",
  aiDescription:
    "Create a folder in the library: title is its name, into the id of the folder to put it in (the library home without it; see read_folder), at the end. Returns the new folder's id. Refused (title-taken) when that folder already has an entry with the same title.",
  title: "New folder",
  target: "library",
  permissionScope: () => ({ books: [], creates: false }), // ブックを変えない
  args: z.strictObject({ title: z.string().trim().min(1), into: z.string().min(1).optional() }),
  run: (library, args, ctx) => {
    const into = args.into ?? HOME_ID
    if (!holdsEntries(library.folders, into)) return null
    const folder: PlainFolder = { folderRole: "folder", id: ctx.newId(), title: args.title, lineup: [] }
    if (folder.id in library.folders || folder.id in library.pages) return null
    const made = { pages: library.pages, folders: { ...library.folders, [folder.id]: folder } }
    const next = placedEntry(made, { kind: "folder", id: folder.id }, into)
    return isMoveRefusal(next) ? null : { next, result: { folder: folder.id } }
  },
})

export const ENTRY_MOVE = kit.defineAction({
  id: "entry-move",
  aiDescription:
    'Move an entry of the library to another folder, or to another position in the same folder: entry is its id (a book or a folder, with everything in it; a page or a binder in a book; or a page or a binder that is not in a book), into the id of the folder to move it to (not inside the entry itself), index the position there (counted without the entry; at the end without it). A book or a folder goes into the library home or a folder. A page or a binder in a book goes into a book (its lineup) or a binder of its page type, in the same book or another; it cannot leave books, and a page in a binder stays in binders. A page or a binder that is not in a book goes into the library home or a folder; it cannot enter a book. Nothing in the entry changes. When the folder already has an entry with the same title, onConflict "refuse" (the default) refuses with title-taken, and "number" moves it with a number added to its title (returned as title). Only the user can replace the entry that is there (entry-move-over).',
  title: "Move",
  target: "library",
  permissionScope: { entry: "entry", where: "place", into: "into" },
  args: z.strictObject({
    entry: z.string().min(1),
    into: z.string().min(1),
    index: z.number().int().min(0).optional(),
    onConflict: z.enum(["refuse", "number"]).default("refuse"),
  }),
  run: (library, args, ctx) => {
    const naming = namingFor(ctx)
    const place = placedOutsideTrash(library.folders, args.entry)
    if (!place || !movesInto(library.folders, args.entry, args.into)) return null
    const moved = movedEntry(library, args.entry, args.into, args.index)
    if (isMoveRefusal(moved)) return null
    if (args.onConflict !== "number" || place.holder.id === args.into) return { next: moved, result: {} }
    const next = numbered(moved, place.ref.kind, args.entry, args.into, naming)
    if (!next) return null
    const title = titleOf(next, place.ref.kind, args.entry, naming)
    return { next, result: next === moved || title === undefined ? {} : { title } }
  },
})

// 上書きの移動: 先のフォルダに同じ名前の物（同じ種類）が在れば、それを中身ごと消してから動かす（消えた物はゴミ箱に入らない。書庫の履歴の 1 段で、両方戻る）。利用者だけ
export const ENTRY_MOVE_OVER = kit.defineAction({
  id: "entry-move-over",
  userOnly: true,
  aiDescription:
    "Move an entry of the library like entry-move, replacing the entry with the same title in that folder: that entry is deleted with everything in it (it does not go to the trash). Only the user can do this.",
  title: "Move and replace",
  target: "library",
  // 上書きで消える物も、中身ごと変える物として名乗る（ロック中なら、行う前に分かる）
  permissionScope: (args: { entry: string; into: string; replaces?: string }): LibraryTargets => ({
    books: [],
    entries: [
      { entry: args.entry, where: "place", into: args.into },
      ...(args.replaces === undefined ? [] : [{ entry: args.replaces, where: "all-pages" as const }]),
    ],
    creates: false,
  }),
  args: z.strictObject({
    entry: z.string().min(1),
    into: z.string().min(1),
    index: z.number().int().min(0).optional(), // 同じ名前の物を消したあとの並びで数える
    replaces: z.string().min(1).optional(), // 消えると利用者が確かめた物の id（今 同じ名前で在る物がそれと違えば断る）
  }),
  run: (library, args, ctx) => {
    const place = placedOutsideTrash(library.folders, args.entry)
    if (!place || place.holder.id === args.into || !movesInto(library.folders, args.entry, args.into)) return null
    const cleared = overwritten(
      library,
      place.ref.kind,
      args.entry,
      args.into,
      args.replaces ?? REPLACES_NOTHING,
      namingFor(ctx),
    )
    if (isNotOverwritten(cleared)) return null
    const next = movedEntry(cleared, args.entry, args.into, args.index)
    return isMoveRefusal(next) ? null : { next, result: {} }
  },
})

export const ENTRY_RENAME = kit.defineAction({
  id: "entry-rename",
  aiDescription:
    "Rename an entry of the library (a book, a folder, a page or a binder; in a book or not): entry is its id (not in the trash), title the new name. Refused (title-taken) when its folder, book or binder already has an entry with that title; not allowed for a locked book, or a locked page or a page in a locked book.",
  title: "Rename",
  target: "library",
  permissionScope: { entry: "entry", where: "title" },
  args: z.strictObject({ entry: z.string().min(1), title: z.string().trim().min(1) }),
  run: (library, args, ctx) => {
    const place = placedOutsideTrash(library.folders, args.entry)
    if (!place) return null
    const next = retitled(library, place.ref.kind, args.entry, args.title, namingFor(ctx))
    return !next || next === library ? null : { next, result: {} }
  },
})
