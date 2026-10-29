// ページを消す: アクション page-remove（ページの中のアイテムと線もいっしょに消える。最後の 1 枚も消せる）
import { z } from "zod"
import { hasPages, removePage } from "../../../core/book"
import { kit } from "../kit"

const ARGS = z.strictObject({ page: z.string().min(1) })

// ページ page を消す（無いページなら断る）。開いていたステージは隣のページを開く（core/stage.ts の followBook）
export const PAGE_REMOVE = kit.defineAction({
  id: "page-remove",
  attach: { pages: true },
  aiDescription:
    "Remove a page with everything on it (it cannot be undone). The last page can be removed too; the book then has no pages.",
  title: "Remove page",
  target: "book",
  args: ARGS,
  permissionScope: { page: "page" },
  run: (book, args) => {
    if (!hasPages(book) || !book.pages.some(p => p.id === args.page)) return null
    return { next: removePage(book, args.page), result: {} }
  },
})
