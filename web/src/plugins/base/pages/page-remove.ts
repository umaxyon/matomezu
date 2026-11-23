// ページを消す: アクション page-remove（ページの中のアイテムと線もいっしょに消える。最後の 1 枚も消せる。バインダの最後の 1 枚を消しても、バインダは残る）
import { z } from "zod"
import { findPage, NO_PAGE, removePage } from "../../../core/book"
import { kit } from "../kit"

const ARGS = z.strictObject({ page: z.string().min(1) })

// ページ page を消す（無いページなら断る）。開いていたステージは隣のページを開く（core/stage.ts の followBook）
export const PAGE_REMOVE = kit.defineAction({
  id: "page-remove",
  attach: { books: true },
  aiDescription:
    "Remove a page with everything on it (it cannot be undone). The last page can be removed too; the book then has no pages. Removing the last page of a binder leaves the binder, empty.",
  title: "Remove page",
  target: "book",
  args: ARGS,
  permissionScope: { page: "page" },
  run: (book, args) => {
    if (findPage(book, args.page) === NO_PAGE) return null
    return { next: removePage(book, args.page), result: {} }
  },
})
