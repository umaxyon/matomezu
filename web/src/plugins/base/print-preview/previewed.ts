// 印刷プレビューで開いているステージエントリ（ステージで開いているブック・ブックの外のバインダ・ブックの外のページ 1 枚）の、
// 並べるエントリと、印刷プレビューの設定の項目の値を持つ物、紙に入れる名前、右サイドパネルで切り替えるロック

import { NO_NAME } from "../../../core/entries"
import type { ItemPage } from "../../../core/placed"
import type { AnyPage, BinderEntry, Book, LineupEntry } from "../../../core/schema/book"
import { openedEntry } from "../../../core/stage"
import { type CommandContext, NO_BOOK, NO_OUTSIDE_BINDER, NO_PAGE } from "../../../store/commands/def"

// ロックを持たないときの値（ブックの外のバインダ）
export const NO_LOCK = "none"

// 右サイドパネルで切り替えるロック: ブックのロック（book-lock・book-unlock）か、ページ page のロック（page-lock・page-unlock）か、持たない
export type PreviewedLock =
  | { of: "book"; locked: boolean }
  | { of: "page"; page: string; locked: boolean }
  | typeof NO_LOCK

export interface PreviewedEntry {
  id: string // ステージエントリの id（print-preview-update の entry・測った結果と右サイドパネルの鍵）
  lineup: readonly LineupEntry[] // 並べるエントリ（ブックはその並び、ブックの外のバインダはそのバインダ 1 つ、ブックの外のページはその 1 枚）
  holder: Book | BinderEntry | ItemPage // 印刷プレビューの設定の項目の値を持つ物（ブック・バインダ・ページ。settingValue に渡す）
  name: string | typeof NO_NAME // 紙に入れる名前（ブック名・バインダ名。ブックの外のページ 1 枚は NO_NAME）
  lock: PreviewedLock
}

// 開いているブック book・ブックの外のバインダ binder・ブックの外のページ page のどれかから、印刷プレビューで開いているステージエントリ（どれも開いていなければ null）
export function previewedOf(
  book: Book | null,
  binder: BinderEntry | null,
  page: ItemPage | null,
): PreviewedEntry | null {
  if (book)
    return {
      id: book.id,
      lineup: book.lineup,
      holder: book,
      name: book.title,
      lock: { of: "book", locked: book.locked === true },
    }
  if (binder) return { id: binder.id, lineup: [binder], holder: binder, name: binder.title, lock: NO_LOCK }
  if (page)
    return {
      id: page.id,
      lineup: [page as AnyPage],
      holder: page,
      name: NO_NAME,
      lock: { of: "page", page: page.id, locked: page.locked === true },
    }
  return null
}

// コマンドの文脈 ctx のステージの、印刷プレビューで開いているステージエントリ（何も開いていなければ null）
export function previewedIn(ctx: CommandContext): PreviewedEntry | null {
  const entry = openedEntry(ctx.stage.opened)
  const page = entry?.kind === "page" && ctx.page !== NO_PAGE && ctx.page.id === entry.id ? ctx.page : null
  return previewedOf(
    ctx.book === NO_BOOK ? null : ctx.book,
    ctx.outsideBinder === NO_OUTSIDE_BINDER ? null : ctx.outsideBinder,
    page,
  )
}
