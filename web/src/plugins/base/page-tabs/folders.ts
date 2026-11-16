// フォルダのアクション: ブックの並びの中の、1 つのタイプのページだけを入れるフォルダ（まとまるタイプのページの入れ物。スライド）の名前を変える・動かす・複製する・消す。
// フォルダを作るのは page-add（into の newFolder）。中のページを足す・動かす・消すのは、ページのアクション
import { z } from "zod"
import {
  addFolder,
  addPage,
  findFolder,
  freeTitle,
  lineupIds,
  lineupOf,
  moveEntry,
  pagesIn,
  putFolder,
  putPage,
  removeFolder,
} from "../../../core/book"
import { ORIENTATIONS } from "../../../core/def/paper"
import { freshPageId } from "../../../core/ids"
import type { ItemPage } from "../../../core/placed"
import type { Book } from "../../../core/schema/book"
import { kit } from "../kit"
import { renewedIds } from "../utils/ids"
import { pageProblems } from "./page-problems"
import { canPaperFolder } from "./pages"

const FOLDER = z.string().min(1)

// フォルダを変える: 名前（同じ名前のほかの並びの要素があれば断る）と、中のページ全部の紙と向き（紙をそろえる規定のタイプのフォルダだけ。1 回で全部のページに付ける）
export const FOLDER_UPDATE = kit.defineAction({
  id: "folder-update",
  attach: { books: true },
  aiDescription:
    "Change a folder of a book (a folder holds the pages of one page type whose grouping is own-folder, and shows as one page tab named after it): its title, and paper and orientation, which are set on every page in it at once (only for a page type whose pages in a folder share one paper, such as slides; among the page type's papers). Only what is given changes. Returns nothing. Refused for a folder not in the book, a title another entry of the book's lineup (a page outside folders, or a folder) has, a paper or orientation the page type does not take, or when nothing is given.",
  title: "Change folder",
  target: "book",
  args: z.strictObject({
    folder: FOLDER,
    title: z.string().trim().min(1).optional(),
    paper: z.string().min(1).optional(),
    orientation: z.enum(ORIENTATIONS).optional(),
  }),
  permissionScope: { entry: "folder" },
  run: (book, args, ctx) => {
    const folder = findFolder(book, args.folder)
    const { title, paper, orientation } = args
    if (!folder || (title === undefined && paper === undefined && orientation === undefined)) return null
    if (title !== undefined && lineupOf(book).some(e => e.id !== args.folder && e.title === title)) return null
    const named = title === undefined ? book : putFolder(book, args.folder, f => ({ ...f, title }))
    if (paper === undefined && orientation === undefined) return { next: named, result: {} }
    const pages = pagesIn(book, args.folder)
    const [first] = pages
    // 空のフォルダは、紙を持つページが無い（次に足すページが、タイプの既定の紙になる）
    if (!first) return null
    const choice = { paper: paper ?? first.paper, orientation: orientation ?? first.orientation }
    if (!canPaperFolder(ctx.catalog, book, args.folder, choice)) return null
    const next = pages.reduce<Book>((b, p) => putPage(b, { ...p, ...choice }), named)
    if (
      pageProblems(
        ctx.catalog,
        next,
        pages.map(p => p.id),
      ).length > 0
    )
      return null
    return { next, result: {} }
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
  permissionScope: { entry: "folder" },
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
    "Duplicate a folder with its pages: a copy is added right after it. title is the copy's name and must differ from the other entries' of the book's lineup; without it the copy is named after the original with a number. The pages and everything on them get new ids; locks, notes and marks are not copied. Returns the new folder's id and its pages' ids, in order. Refused for a folder not in the book or a title already used.",
  title: "Duplicate folder",
  target: "book",
  args: z.strictObject({ folder: FOLDER, title: z.string().trim().min(1).optional() }),
  permissionScope: { entry: "folder" },
  run: (book, args, ctx) => {
    const source = findFolder(book, args.folder)
    if (!source) return null
    const titles = lineupOf(book).map(e => e.title)
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
      { ...source, id: fresh(), title: args.title ?? freeTitle(source.title, titles), lineup: [] },
      lineupOf(book).findIndex(e => e.id === source.id) + 1,
    )
    const made = lineupOf(next)[lineupOf(book).findIndex(e => e.id === source.id) + 1]
    if (made?.kind !== "folder") return null
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
  permissionScope: { entry: "folder" },
  run: (book, args) => {
    if (!findFolder(book, args.folder)) return null
    return { next: removeFolder(book, args.folder), result: {} }
  },
})
