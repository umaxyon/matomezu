// ex6 の重さ: ページの形の重さを足し合わせるアクション。形の重さは、機能台帳の形の定義オブジェクトのメソッド（kit.name("weight")）
// （ex6 の連携ポイント ex6-spec が拡張ポイントに書き足したもの）に聞く。答えない形は 0
import type {} from "ex6-spec"
import { shapesOf, z } from "matomezu"
import { kit } from "./kit"

// ページの形の重さの合計
export const PAGE_WEIGHT = kit.defineAction({
  id: "page-weight",
  attach: { pages: true },
  title: "pageWeight",
  aiDescription:
    "Sum the weight of the shapes on the page (shapes that do not tell their weight count as 0). Returns the sum.",
  target: "book",
  args: z.strictObject({ page: z.string().min(1) }),
  run: (book, args, ctx) => {
    const page = book.pages.find(p => p.id === args.page)
    if (!page) return null
    let weight = 0
    for (const shape of shapesOf(page)) {
      const def = ctx.catalog.items.get(shape.item)
      if (def?.kind === "shape") weight += def[kit.name("weight")]?.(shape) ?? 0
    }
    return { next: book, result: { weight } }
  },
})
