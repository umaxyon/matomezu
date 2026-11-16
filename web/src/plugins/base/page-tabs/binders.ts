// バインダのアクション: ブックの中の、1 つのタイプのページだけを入れるバインダ（スライドなど）の名前を変える・動かす・複製する・消す。
// バインダを作るのは page-add（into の newBinder）。中のページを足す・動かす・消すのは、ページのアクション
import { z } from "zod"
import {
  addBinder,
  addPage,
  findBinder,
  freeTitle,
  lineupIds,
  lineupOf,
  moveEntry,
  pagesIn,
  putBinder,
  putPage,
  removeBinder,
} from "../../../core/book"
import { ORIENTATIONS } from "../../../core/def/paper"
import { freshPageId } from "../../../core/ids"
import type { ItemPage } from "../../../core/placed"
import type { Book } from "../../../core/schema/book"
import { kit } from "../kit"
import { renewedIds } from "../utils/ids"
import { pageProblems } from "./page-problems"
import { canPaperBinder } from "./pages"

const BINDER = z.string().min(1)

// バインダを変える: 名前（同じ名前のほかのエントリがあれば断る）と、中のページ全部の紙と向き（1 回で全部のページに付ける）
export const BINDER_UPDATE = kit.defineAction({
  id: "binder-update",
  attach: { books: true },
  aiDescription:
    "Change a binder of a book (a binder holds the pages of one page type whose grouping is binder, and shows as one page tab named after it): its title, and paper and orientation, which are set on every page in it at once (the pages in a binder share one paper and orientation; among the page type's papers). Only what is given changes. Returns nothing. Refused for a binder not in the book, a title another entry of the book's lineup (a page outside binders, or a binder) has, a paper or orientation the page type does not take, or when nothing is given. Not allowed (not-allowed) for a binder whose page type leaves this action out.",
  title: "Change binder",
  target: "book",
  args: z.strictObject({
    binder: BINDER,
    title: z.string().trim().min(1).optional(),
    paper: z.string().min(1).optional(),
    orientation: z.enum(ORIENTATIONS).optional(),
  }),
  permissionScope: { entry: "binder" },
  run: (book, args, ctx) => {
    const binder = findBinder(book, args.binder)
    const { title, paper, orientation } = args
    if (!binder || (title === undefined && paper === undefined && orientation === undefined)) return null
    if (title !== undefined && lineupOf(book).some(e => e.id !== args.binder && e.title === title)) return null
    const named = title === undefined ? book : putBinder(book, args.binder, f => ({ ...f, title }))
    if (paper === undefined && orientation === undefined) return { next: named, result: {} }
    const pages = pagesIn(book, args.binder)
    const [first] = pages
    // 空のバインダは、紙を持つページが無い（次に足すページが、タイプの既定の紙になる）
    if (!first) return null
    const choice = { paper: paper ?? first.paper, orientation: orientation ?? first.orientation }
    if (!canPaperBinder(ctx.catalog, book, args.binder, choice)) return null
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

// バインダを、ブックの並びの、そのバインダを除いて数えた index 番目に動かす（index が無ければ末尾）
export const BINDER_MOVE = kit.defineAction({
  id: "binder-move",
  attach: { books: true },
  aiDescription:
    "Move a binder to index among the entries of the book's lineup counted without it (the end without index), which reorders the page tabs. Returns nothing. Refused for a binder not in the book, an index past the end, or when the binder would stay where it is. Not allowed (not-allowed) for a binder whose page type leaves this action out.",
  title: "Move binder",
  target: "book",
  args: z.strictObject({ binder: BINDER, index: z.number().int().min(0).optional() }),
  permissionScope: { entry: "binder" },
  run: (book, args) => {
    const ids = lineupOf(book).map(e => e.id)
    const from = ids.indexOf(args.binder)
    const to = args.index ?? ids.length - 1
    if (!findBinder(book, args.binder) || to > ids.length - 1 || to === from) return null
    return { next: moveEntry(book, args.binder, to), result: {} }
  },
})

// バインダを、中のページごと複製する（元のすぐ後ろ。中の物の id は振り直し、ロックは写さない）。名前は、ほかのバインダと重ならない名前
export const BINDER_DUPLICATE = kit.defineAction({
  id: "binder-duplicate",
  attach: { books: true },
  aiDescription:
    "Duplicate a binder with its pages: a copy is added right after it. title is the copy's name and must differ from the other entries' of the book's lineup; without it the copy is named after the original with a number. The pages and everything on them get new ids; locks, notes and marks are not copied. Returns the new binder's id and its pages' ids, in order. Refused for a binder not in the book or a title already used. Not allowed (not-allowed) for a binder whose page type leaves this action out.",
  title: "Duplicate binder",
  target: "book",
  args: z.strictObject({ binder: BINDER, title: z.string().trim().min(1).optional() }),
  permissionScope: { entry: "binder" },
  run: (book, args, ctx) => {
    const source = findBinder(book, args.binder)
    if (!source) return null
    const titles = lineupOf(book).map(e => e.title)
    if (args.title !== undefined && titles.includes(args.title)) return null
    const taken = lineupIds(book)
    const fresh = () => {
      const id = freshPageId(ctx.newId, taken)
      taken.push(id)
      return id
    }
    // 中の物の id は、ページごとに振り直す（ブックのどの id とも、写しどうしでも重ならない。core が run の振る id を重ねない）
    let next: Book = addBinder(
      book,
      { ...source, id: fresh(), title: args.title ?? freeTitle(source.title, titles), lineup: [] },
      lineupOf(book).findIndex(e => e.id === source.id) + 1,
    )
    const made = lineupOf(next)[lineupOf(book).findIndex(e => e.id === source.id) + 1]
    if (made?.kind !== "binder") return null
    const pages: string[] = []
    for (const page of pagesIn(book, source.id)) {
      const { id: _id, locked: _locked, ...content } = page
      const copy = { ...renewedIds(page, content, ctx.newId), id: fresh() } as ItemPage
      pages.push(copy.id)
      next = addPage(next, copy, { binder: made.id })
    }
    return { next, result: { binder: made.id, pages } }
  },
})

// バインダを、中のページごと消す
export const BINDER_REMOVE = kit.defineAction({
  id: "binder-remove",
  attach: { books: true },
  aiDescription:
    "Remove a binder with all its pages and everything on them (it cannot be undone). Returns nothing. Refused for a binder not in the book. Not allowed (not-allowed) for a binder whose page type leaves this action out.",
  title: "Remove binder",
  target: "book",
  args: z.strictObject({ binder: BINDER }),
  permissionScope: { entry: "binder" },
  run: (book, args) => {
    if (!findBinder(book, args.binder)) return null
    return { next: removeBinder(book, args.binder), result: {} }
  },
})
