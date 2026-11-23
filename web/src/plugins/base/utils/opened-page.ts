// コマンドの文脈の、開いているページの決まり: 開いているかも中身も ctx.page だけで決める（ステージの開いている物から求め直さない）
import { pagesOf } from "../../../core/book"
import type { ItemPage } from "../../../core/placed"
import type { BinderEntry, Book, Page } from "../../../core/schema/book"
import { NO_STAGE, shownPageId } from "../../../core/stage"
import type { StageView } from "../../../core/workspace"
import { type CommandContext, NO_BOOK, NO_OUTSIDE_BINDER, NO_PAGE } from "../../../store/commands/def"

// ctx のステージでページを開いていて、その中身が読めるか（通ったあとは ctx.page がページ）
export const hasOpenedPage = <C extends Pick<CommandContext, "page">>(ctx: C): ctx is C & { page: ItemPage } =>
  ctx.page !== NO_PAGE

// ステージの見え方 view（useStage の値）のステージで開いているページの id（ステージでないか、ページを開いていなければ NO_PAGE）
export const stagePageId = (view: StageView | typeof NO_STAGE): string =>
  view === NO_STAGE ? NO_PAGE : shownPageId(view.opened)

// ステージで開いている物のページの全部: ブック book を開いていれば、そのブックのページ。ブックの外のバインダ binder を開いていれば、その中のページ。
// ブックの外のページ page を開いていれば、そのページだけ。何も開いていなければ空
export const openedPagesFrom = (
  book: Book | typeof NO_BOOK,
  binder: BinderEntry | typeof NO_OUTSIDE_BINDER,
  page: Page | typeof NO_PAGE,
): readonly Page[] =>
  book !== NO_BOOK ? pagesOf(book) : binder !== NO_OUTSIDE_BINDER ? binder.lineup : page !== NO_PAGE ? [page] : []

// ctx のステージで開いている物のページの全部（openedPagesFrom）
export const openedPagesOf = (ctx: Pick<CommandContext, "book" | "outsideBinder" | "page">): readonly Page[] =>
  openedPagesFrom(ctx.book, ctx.outsideBinder, ctx.page)
