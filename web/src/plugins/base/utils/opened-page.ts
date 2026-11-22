// コマンドの文脈の、開いているページの決まり: 開いているかも中身も ctx.page だけで決める（ステージの開いている物から求め直さない）
import { pagesOf } from "../../../core/book"
import type { ItemPage } from "../../../core/placed"
import type { BinderEntry, Book, Page } from "../../../core/schema/book"
import { type CommandContext, NO_BOOK, NO_OUTSIDE_BINDER, NO_PAGE } from "../../../store/commands/def"

// ctx のステージでページを開いていて、その中身が読めるか（通ったあとは ctx.page がページ）
export const hasOpenedPage = <C extends Pick<CommandContext, "page">>(ctx: C): ctx is C & { page: ItemPage } =>
  ctx.page !== NO_PAGE

// ステージで開いている物のページの全部: ブック book を開いていれば、そのブックのページ。ブックの外のバインダ binder を開いていれば、その中のページ。
// ブックの外のページ page を開いていれば、そのページだけ。何も開いていなければ空
export const openedPagesFrom = (book: Book | null, binder: BinderEntry | null, page: Page | null): readonly Page[] =>
  book ? pagesOf(book) : binder ? binder.lineup : page ? [page] : []

// ctx のステージで開いている物のページの全部（openedPagesFrom）
export const openedPagesOf = (ctx: Pick<CommandContext, "book" | "outsideBinder" | "page">): readonly Page[] =>
  openedPagesFrom(
    ctx.book === NO_BOOK ? null : ctx.book,
    ctx.outsideBinder === NO_OUTSIDE_BINDER ? null : ctx.outsideBinder,
    hasOpenedPage(ctx) ? ctx.page : null,
  )
