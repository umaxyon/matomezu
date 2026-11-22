// 書庫のエントリを動かす・名前を変える・フォルダを作る: entry-move は、書庫のエントリ（ブックの中のページ・バインダも）を、別のフォルダ（か同じフォルダ）の何番目かへ動かす。
// まとまるタイプ（grouping が binder）のページをバインダでない所へ動かすと、そのページだけのバインダの行を作り、ブックの外で空になったバインダの行を消す（core/entries.ts の movedWithBinders）。
// entry-rename は、その名前を変える。folder-create は、フォルダを作る。どれも、エントリの中身は変えない。
// 同じフォルダの中に同じ名前は置けない（土台が title-taken で断る）。entry-move の onConflict が number なら、番号を付けた名前にして入れる
import { z } from "zod"
import { CREATES_NOTHING, type LibraryTargets } from "../../../core/def/action"
import {
  carriedEntry,
  isMoveRefusal,
  movedWithBinders,
  NEW_BINDER,
  placeOf,
  retitled,
  titleOf,
} from "../../../core/entries"
import { kit } from "../kit"
import { withDateFolder } from "./date-folder"
import {
  holdsEntries,
  isNotOverwritten,
  movesInto,
  numbered,
  overwritten,
  placedOutsideTrash,
  REPLACES_NOTHING,
  withNewFolder,
} from "./entries"

export const FOLDER_CREATE = kit.defineAction({
  id: "folder-create",
  aiDescription:
    "Create a folder in the library: title is its name, into the id of the folder to put it in (see read_folder; without it, the folder named today's date (YYYY-MM-DD) in the documents folder, made when missing), at the end. Returns the new folder's id. Refused (title-taken) when that folder already has an entry with the same title.",
  title: "New folder",
  target: "library",
  permissionScope: (args: { into?: string }): LibraryTargets => ({
    books: [],
    // 入れるフォルダを言わなければ、置き場所では問わない（日付フォルダに入る）
    creates: [{ kind: "folder", ...(args.into === undefined ? {} : { into: args.into }) }],
  }),
  args: z.strictObject({ title: z.string().trim().min(1), into: z.string().min(1).optional() }),
  run: (library, args, ctx) => {
    const id = ctx.newId()
    // 日付フォルダの id は、作るフォルダの id の後に、いつも引く（日付フォルダがもう在っても、振る id の順が変わらない）
    const placed =
      args.into === undefined ? withDateFolder(library, ctx.today, ctx.newId()) : { library, folder: args.into }
    if (!placed || !holdsEntries(placed.library.folders, placed.folder)) return null
    const next = withNewFolder(placed.library, id, args.title, placed.folder)
    return next ? { next, result: { folder: id, into: placed.folder } } : null
  },
})

// entry-move・entry-move-over の結果: バインダを作ったなら、その id binder と名前 title。番号を付けて動かしたなら、付けた名前 title
type MoveResult = { binder?: string; title?: string }
const madeResult = (made: { id: string; title: string }): MoveResult => ({ binder: made.id, title: made.title })
const NO_RESULT: MoveResult = {}

export const ENTRY_MOVE = kit.defineAction({
  id: "entry-move",
  aiDescription:
    'Move an entry of the library to another folder, or to another position in the same folder: entry is its id (a book or a folder, with everything in it; a page or a binder in a book; or a page or a binder that is not in a book), into the id of the folder to move it to (not inside the entry itself), index the position there (counted without the entry; at the end without it). A book or a folder goes into the library home or a folder. A page or a binder, in a book or not, goes into a book (its lineup), the library home or a folder; an empty binder cannot leave its book. A page of a type kept in binders (a slide) goes from its binder into a binder of its page type with the same paper and orientation, or into a place that is not a binder (a folder, the library home or a book): there a new binder holding only that page is made at index, returned as binder, with its title returned as title ("<binder title> - <page title>", with a number added when that title is taken); when the page is the only one in a binder that is not in a book, that binder moves instead. A binder that is not in a book is deleted when the move leaves it empty. Nothing in the entry changes. When the folder already has an entry with the same title, onConflict "refuse" (the default) refuses with title-taken, and "number" moves it with a number added to its title (returned as title). Only the user can replace the entry that is there (entry-move-over).',
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
    const naming = ctx.naming
    if (!placedOutsideTrash(library.folders, args.entry) || !movesInto(ctx.catalog, library, args.entry, args.into))
      return null
    const done = movedWithBinders(ctx.catalog, library, args.entry, args.into, args.index, naming, () => ctx.newId())
    if (isMoveRefusal(done)) return null
    const { next: moved, carried, made } = done
    // 作ったバインダの名前は、重なりに番号を付けてあり、いつも返す
    if (made) return { next: moved, result: madeResult(made) }
    if (args.onConflict !== "number" || placeOf(library.folders, carried.id)?.holder.id === args.into)
      return { next: moved, result: NO_RESULT }
    const next = numbered(moved, carried.kind, carried.id, args.into, naming)
    if (!next) return null
    const title = titleOf(next, carried.kind, carried.id, naming)
    return { next, result: next === moved || title === undefined ? NO_RESULT : { title } }
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
    creates: CREATES_NOTHING,
  }),
  args: z.strictObject({
    entry: z.string().min(1),
    into: z.string().min(1),
    index: z.number().int().min(0).optional(), // 同じ名前の物を消したあとの並びで数える
    replaces: z.string().min(1).optional(), // 消えると利用者が確かめた物の id（今 同じ名前で在る物がそれと違えば断る）
  }),
  run: (library, args, ctx) => {
    const { catalog, naming } = ctx
    const newId = () => ctx.newId()
    const replaces = args.replaces ?? REPLACES_NOTHING
    if (!placedOutsideTrash(library.folders, args.entry) || !movesInto(catalog, library, args.entry, args.into))
      return null
    const carried = carriedEntry(catalog, library, args.entry, args.into)
    if (!carried) return null
    // 作るバインダの名前は重なりに番号を付けるので、消す物は無い（entry-move と同じ結果）
    if (carried === NEW_BINDER) {
      const done =
        replaces === REPLACES_NOTHING &&
        movedWithBinders(catalog, library, args.entry, args.into, args.index, naming, newId)
      if (!done || isMoveRefusal(done) || !done.made) return null
      return { next: done.next, result: madeResult(done.made) }
    }
    if (placeOf(library.folders, carried.id)?.holder.id === args.into) return null
    const cleared = overwritten(library, carried.kind, carried.id, args.into, replaces, naming)
    if (isNotOverwritten(cleared)) return null
    const done = movedWithBinders(catalog, cleared, args.entry, args.into, args.index, naming, newId)
    return isMoveRefusal(done) ? null : { next: done.next, result: NO_RESULT }
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
    const next = retitled(library, place.ref.kind, args.entry, args.title, ctx.naming)
    return !next || next === library ? null : { next, result: {} }
  },
})
