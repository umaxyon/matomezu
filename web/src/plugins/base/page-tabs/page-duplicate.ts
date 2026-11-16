// ページを複製する: アクション page-duplicate（元のページのすぐ後ろ（同じブックかバインダの中）に、中身を写したページを足す）。
// 中の物の id（ページの中のどの深さのオブジェクトの id）は、ブック全体で重ならないよう振り直し、つなぐものが指す相手（from・to）も新しい id に付け替える。
// ロックは写さない。伝言・マークなど物に付けた物は写さない。使えるのは、タイプが宣言した（duplicatesPages）ページだけ（宣言の無いタイプは、中の id を指す別のフィールドを持ちうるので断る）。id を振り直すと壊れる形（定義の survivesRenewedIds が false）のあるページも断る。
// 写しの名前は、同じブックかバインダのほかのページと重ならない名前にする（渡した名前が重なれば断る。渡さなければ、元の名前に番号を付ける）
import { z } from "zod"
import { addPage, findPage, freeTitle, siblingsOf } from "../../../core/book"
import { type CoreCatalog, pageType } from "../../../core/core-catalog"
import type { Declined } from "../../../core/def/action"
import type { ItemPage } from "../../../core/placed"
import { kit } from "../kit"
import { renewedIds, survivesRenewedIds } from "../utils/ids"

// 複製を断る種類: id を振り直すと壊れる形がページにある（画面は、この種類で知らせる）
export const UNRENEWABLE_SHAPE = kit.name("unrenewable-shape")

// ページ page を複製できない理由（タイプが複製を宣言していなければ "type"、id を振り直すと壊れる形があれば "content"。複製できれば null）
export function duplicateProblem(catalog: CoreCatalog, page: ItemPage): "type" | "content" | null {
  if (!pageType(catalog, page.type).duplicatesPages) return "type"
  const { id: _id, ...content } = page
  return survivesRenewedIds(catalog, content) ? null : "content"
}

// id を振り直すと壊れる形がページにあるときの断り
export const UNRENEWABLE_DECLINED: Declined = {
  declined: "a page holds an item that cannot be copied (such as a data item)",
  kind: UNRENEWABLE_SHAPE,
}

const ARGS = z.strictObject({ page: z.string().min(1), title: z.string().trim().min(1).optional() })

export const PAGE_DUPLICATE = kit.defineAction({
  id: "page-duplicate",
  attach: { books: true },
  aiDescription:
    "Duplicate a page: a copy with the same contents is added right after it, in the same place (the book's lineup or its binder). title is the copy's name and must differ from the other pages' there; without it the copy is named after the original with a number (such as \"Plan 2\"). Everything on the copy gets new ids. The lock and notes or marks on the page are not copied. Returns the new page's id. Refused for a page not in the book, for a page type whose pages cannot be duplicated, for a page holding an item that cannot be copied (such as a data item), or for a title already used there. Not allowed (not-allowed) for a page whose page type leaves this action out.",
  title: "Duplicate page",
  target: "book",
  args: ARGS,
  permissionScope: { entry: "page" },
  run: (book, args, ctx) => {
    const at = findPage(book, args.page)
    if (!at) return null
    const problem = duplicateProblem(ctx.catalog, at.page)
    if (problem === "content") return UNRENEWABLE_DECLINED
    if (problem) return null
    const siblings = siblingsOf(book, args.page) ?? []
    const titles = siblings.map(e => e.title)
    if (args.title !== undefined && titles.includes(args.title)) return null
    const { id: _id, locked: _locked, ...content } = at.page
    const copy = { ...renewedIds(at.page, content, ctx.newId), title: args.title ?? freeTitle(at.page.title, titles) }
    const index = siblings.findIndex(e => e.id === args.page) + 1
    const added = addPage(book, copy, at.binder ? { binder: at.binder.id, index } : { index }, ctx.newId)
    return added ? { next: added.book, result: { page: added.page } } : null
  },
})
