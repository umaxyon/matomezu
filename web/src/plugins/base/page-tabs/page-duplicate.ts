// ページを複製する: アクション page-duplicate（元のページのすぐ後ろ（同じ入れ物の中）に、中身を写したページを足す）。
// 中の物の id（ページの中のどの深さのオブジェクトの id）は、ブック全体で重ならないよう振り直し、つなぐものが指す相手（from・to）も新しい id に付け替える。
// ロックは写さない。伝言・マークなど物に付けた物は写さない。使えるのは、タイプが宣言した（duplicatesPages）ページだけ（宣言の無いタイプは、中の id を指す別のフィールドを持ちうるので断る）。
// 写しの名前は、同じ入れ物のほかのページと重ならない名前にする（渡した名前が重なれば断る。渡さなければ、元の名前に番号を付ける）
import { z } from "zod"
import { addPage, findPage, lineupIds, siblingsOf } from "../../../core/book"
import { pageType } from "../../../core/core-catalog"
import { freshPageId } from "../../../core/ids"
import type { ItemPage } from "../../../core/placed"
import { kit } from "../kit"
import { renewedIds } from "../utils/ids"

const ARGS = z.strictObject({ page: z.string().min(1), title: z.string().trim().min(1).optional() })

// 名前 title に番号を付けた、taken に無い名前（「名前 2」から）
export function numberedTitle(title: string, taken: readonly string[]): string {
  for (let n = 2; ; n++) {
    const made = `${title} ${n}`
    if (!taken.includes(made)) return made
  }
}

export const PAGE_DUPLICATE = kit.defineAction({
  id: "page-duplicate",
  attach: { books: true },
  aiDescription:
    "Duplicate a page: a copy with the same contents is added right after it, in the same place (the book's lineup or its folder). title is the copy's name and must differ from the other pages' there; without it the copy is named after the original with a number (such as \"Plan 2\"). Everything on the copy gets new ids. The lock and notes or marks on the page are not copied. Returns the new page's id. Refused for a page not in the book, for a page type whose pages cannot be duplicated, or for a title already used there.",
  title: "Duplicate page",
  target: "book",
  args: ARGS,
  permissionScope: "book",
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
      title: args.title ?? numberedTitle(at.page.title, titles),
    }
    const index = siblings.findIndex(e => e.id === args.page) + 1
    return {
      next: addPage(book, page, at.folder ? { folder: at.folder.id, index } : { index }),
      result: { page: page.id },
    }
  },
})
