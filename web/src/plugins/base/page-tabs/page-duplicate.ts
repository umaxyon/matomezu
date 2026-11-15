// ページを複製する: アクション page-duplicate（元のページのすぐ後ろに、中身を写したページを足す）。
// 中の物の id（ページの中のどの深さのオブジェクトの id）は、ブック全体で重ならないよう振り直し、つなぐものが指す相手（from・to）も新しい id に付け替える。
// ロックは写さない。伝言・マークなど物に付けた物は写さない。使えるのは、タイプが宣言した（duplicatesPages）ブックだけ（宣言の無いタイプは、中の id を指す別のフィールドを持ちうるので断る）
import { z } from "zod"
import { hasPages, putPage } from "../../../core/book"
import { pageType } from "../../../core/core-catalog"
import { freshPageId } from "../../../core/ids"
import type { ItemPage } from "../../../core/placed"
import { kit } from "../kit"
import { renewedIds } from "../utils/ids"

const ARGS = z.strictObject({ page: z.string().min(1), title: z.string().trim().min(1).optional() })

export const PAGE_DUPLICATE = kit.defineAction({
  id: "page-duplicate",
  attach: { pages: true },
  aiDescription:
    "Duplicate a page: a copy with the same contents is added right after it (title is the copy's name; the original's without it). Everything on the copy gets new ids. The lock and notes or marks on the page are not copied. Returns the new page's id. Refused for a page not in the book, or for a book type whose pages cannot be duplicated.",
  title: "Duplicate page",
  target: "book",
  args: ARGS,
  permissionScope: "book",
  run: (book, args, ctx) => {
    if (!hasPages(book) || !pageType(ctx.catalog, book.type).duplicatesPages) return null
    const from = book.pages.findIndex(p => p.id === args.page)
    const source = book.pages[from]
    if (!source) return null
    const { id: _id, locked: _locked, ...content } = source
    const id = freshPageId(
      ctx.newId,
      book.pages.map(p => p.id),
    )
    const page: ItemPage = { ...renewedIds(book, content, ctx.newId), id, title: args.title ?? source.title }
    return { next: putPage(book, page, from + 1), result: { page: page.id } }
  },
})
