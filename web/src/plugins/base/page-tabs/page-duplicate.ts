// ページを複製する: アクション page-duplicate（元のページのすぐ後ろ（同じブックかバインダの中）に、中身を写したページを足す）。
// 中の物の id（ページの中のどの深さのオブジェクトの id）は、ブック全体で重ならないよう振り直し、つなぐものが指す相手（from・to）も新しい id に付け替える。
// ロックは写さない。伝言・マークなど物に付けた物は写さない。使えるのは、タイプが宣言した（duplicatesPages）ページだけ（宣言の無いタイプは、中の id を指す別のフィールドを持ちうるので断る）。
// 写しの名前は、同じブックかバインダのほかのページと重ならない名前にする（渡した名前が重なれば断る。渡さなければ、元の名前に番号を付ける）
import { z } from "zod"
import { addPage, findPage, freeTitle, lineupIds, siblingsOf } from "../../../core/book"
import { pageType } from "../../../core/core-catalog"
import { freshPageId } from "../../../core/ids"
import type { ItemPage } from "../../../core/placed"
import { kit } from "../kit"
import { renewedIds } from "../utils/ids"

const ARGS = z.strictObject({ page: z.string().min(1), title: z.string().trim().min(1).optional() })

export const PAGE_DUPLICATE = kit.defineAction({
  id: "page-duplicate",
  attach: { books: true },
  aiDescription:
    "Duplicate a page: a copy with the same contents is added right after it, in the same place (the book's lineup or its binder). title is the copy's name and must differ from the other pages' there; without it the copy is named after the original with a number (such as \"Plan 2\"). Everything on the copy gets new ids. The lock and notes or marks on the page are not copied. Returns the new page's id. Refused for a page not in the book, for a page type whose pages cannot be duplicated, or for a title already used there. Not allowed (not-allowed) for a page whose page type leaves this action out.",
  title: "Duplicate page",
  target: "book",
  args: ARGS,
  permissionScope: { entry: "page" },
  run: (book, args, ctx) => {
    const at = findPage(book, args.page)
    if (!at || !pageType(ctx.catalog, at.page.type).duplicatesPages) return null
    const siblings = siblingsOf(book, args.page) ?? []
    const titles = siblings.map(e => e.title)
    if (args.title !== undefined && titles.includes(args.title)) return null
    const { id: _id, locked: _locked, ...content } = at.page
    const id = freshPageId(ctx.newId, lineupIds(book))
    const page: ItemPage = {
      ...renewedIds(book, content, ctx.newId),
      id,
      title: args.title ?? freeTitle(at.page.title, titles),
    }
    const index = siblings.findIndex(e => e.id === args.page) + 1
    return {
      next: addPage(book, page, at.binder ? { binder: at.binder.id, index } : { index }),
      result: { page: page.id },
    }
  },
})
