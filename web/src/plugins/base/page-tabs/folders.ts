// フォルダのアクション: ブックの並びの中の、1 つのタイプのページだけを入れるフォルダ（まとまるタイプのページの入れ物。スライド）の名前を変える・動かす・複製する・消す。
// フォルダを作るのは page-add（into の newFolder）。中のページを足す・動かす・消すのは、ページのアクション
import { z } from "zod"
import {
  addFolder,
  addPage,
  findFolder,
  foldersOf,
  lineupIds,
  lineupOf,
  moveEntry,
  pagesIn,
  putFolder,
  removeFolder,
} from "../../../core/book"
import { freshPageId } from "../../../core/ids"
import type { ItemPage } from "../../../core/placed"
import type { Book } from "../../../core/schema/book"
import { kit } from "../kit"
import { renewedIds } from "../utils/ids"
import { numberedTitle } from "./page-duplicate"

const FOLDER = z.string().min(1)

// フォルダの名前を変える（同じ名前のほかのフォルダがあれば断る）
export const FOLDER_UPDATE = kit.defineAction({
  id: "folder-update",
  attach: { books: true },
  aiDescription:
    "Rename a folder of a book (a folder holds the pages of one page type whose grouping is own-folder, and shows as one page tab named after it). Returns nothing. Refused for a folder not in the book, or a title another folder of the book has.",
  title: "Rename folder",
  target: "book",
  args: z.strictObject({ folder: FOLDER, title: z.string().trim().min(1) }),
  permissionScope: "book",
  run: (book, args) => {
    if (!findFolder(book, args.folder)) return null
    if (foldersOf(book).some(f => f.id !== args.folder && f.title === args.title)) return null
    return { next: putFolder(book, args.folder, f => ({ ...f, title: args.title })), result: {} }
  },
})

// フォルダを、ブックの並びの、そのフォルダを除いて数えた index 番目に動かす（index が無ければ末尾）
export const FOLDER_MOVE = kit.defineAction({
  id: "folder-move",
  attach: { books: true },
  aiDescription:
    "Move a folder to index among the entries of the book's lineup counted without it (the end without index), which reorders the page tabs. Returns nothing. Refused for a folder not in the book, an index past the end, or when the folder would stay where it is.",
  title: "Move folder",
  target: "book",
  args: z.strictObject({ folder: FOLDER, index: z.number().int().min(0).optional() }),
  permissionScope: "book",
  run: (book, args) => {
    const ids = lineupOf(book).map(e => e.id)
    const from = ids.indexOf(args.folder)
    const to = args.index ?? ids.length - 1
    if (!findFolder(book, args.folder) || to > ids.length - 1 || to === from) return null
    return { next: moveEntry(book, args.folder, to), result: {} }
  },
})

// フォルダを、中のページごと複製する（元のすぐ後ろ。中の物の id は振り直し、ロックは写さない）。名前は、ほかのフォルダと重ならない名前
export const FOLDER_DUPLICATE = kit.defineAction({
  id: "folder-duplicate",
  attach: { books: true },
  aiDescription:
    "Duplicate a folder with its pages: a copy is added right after it. title is the copy's name and must differ from the other folders'; without it the copy is named after the original with a number. The pages and everything on them get new ids; locks, notes and marks are not copied. Returns the new folder's id and its pages' ids, in order. Refused for a folder not in the book or a title already used.",
  title: "Duplicate folder",
  target: "book",
  args: z.strictObject({ folder: FOLDER, title: z.string().trim().min(1).optional() }),
  permissionScope: "book",
  run: (book, args, ctx) => {
    const source = findFolder(book, args.folder)
    if (!source) return null
    const titles = foldersOf(book).map(f => f.title)
    if (args.title !== undefined && titles.includes(args.title)) return null
    const taken = lineupIds(book)
    const fresh = () => {
      const id = freshPageId(ctx.newId, taken)
      taken.push(id)
      return id
    }
    // 中の物の id は、写したページを足しながら振り直す（写しどうしでも重ならないように、足したブックの上で振る）
    let next: Book = addFolder(
      book,
      { ...source, id: fresh(), title: args.title ?? numberedTitle(source.title, titles), lineup: [] },
      lineupOf(book).findIndex(e => e.id === source.id) + 1,
    )
    const made = lineupOf(next)[lineupOf(book).findIndex(e => e.id === source.id) + 1]
    if (!made || made.kind !== "folder") return null
    const pages: string[] = []
    for (const page of pagesIn(book, source.id)) {
      const { id: _id, locked: _locked, ...content } = page
      const copy = { ...renewedIds(next, content, ctx.newId), id: fresh() } as ItemPage
      pages.push(copy.id)
      next = addPage(next, copy, { folder: made.id })
    }
    return { next, result: { folder: made.id, pages } }
  },
})

// フォルダを、中のページごと消す
export const FOLDER_REMOVE = kit.defineAction({
  id: "folder-remove",
  attach: { books: true },
  aiDescription:
    "Remove a folder with all its pages and everything on them (it cannot be undone). Returns nothing. Refused for a folder not in the book.",
  title: "Remove folder",
  target: "book",
  args: z.strictObject({ folder: FOLDER }),
  permissionScope: "book",
  run: (book, args) => {
    if (!findFolder(book, args.folder)) return null
    return { next: removeFolder(book, args.folder), result: {} }
  },
})
