// ロック: ブックとページに掛ける「変えない」印（locked は土台のフィールド）。ロック中は利用者も AI も中身を変えられず、ゴミ箱へも入れられない（断るのは core の perform）。
// 掛けるのは利用者も AI もでき、外すのは利用者だけ（userOnly）
import { z } from "zod"
import { hasPages, putPage } from "../../../core/book"
import type { Book } from "../../../core/schema/book"
import { setField } from "../fields"
import { kit } from "../kit"

const lockBook = (book: Book, on: boolean): Book | null =>
  !!book.locked === on ? null : setField(book, ["title"], "locked", on ? true : undefined)

function lockPage(book: Book, page: string, on: boolean): Book | null {
  const found = hasPages(book) ? book.pages.find(p => p.id === page) : undefined
  if (!hasPages(book) || !found || !!found.locked === on) return null
  return putPage(book, setField(found, ["orientation"], "locked", on ? true : undefined))
}

// ロックを切り替えながら change を行う（設定のダイアログの確定）: 外すなら先に外し、change が断られたら掛け直す。掛けるなら change の後に掛ける。
// lock・unlock はロックを掛ける・外す、was は今ロック中か、want はロックしたいか。change が通ったかを返す
export function changeWithLock(
  was: boolean,
  want: boolean,
  lock: () => boolean,
  unlock: () => boolean,
  change: () => boolean,
): boolean {
  if (was && !want && !unlock()) return false
  if (!change()) {
    if (was && !want) lock()
    return false
  }
  if (!was && want) lock()
  return true
}

const PAGE_ARGS = z.strictObject({ page: z.string().min(1) })

export const BOOK_LOCK = kit.defineAction({
  id: "book-lock",
  attach: { books: true },
  aiDescription:
    "Lock the book: while locked, nothing in it can be changed and it cannot be moved to the trash, by the user or by AI (refused with locked). Only the user can unlock it. Refused if it is already locked.",
  title: "Lock book",
  target: "book",
  args: z.strictObject({}),
  run: book => {
    const next = lockBook(book, true)
    return next ? { next, result: {} } : null
  },
})

export const BOOK_UNLOCK = kit.defineAction({
  id: "book-unlock",
  attach: { books: true },
  userOnly: true,
  aiDescription: "Unlock the book (only the user can).",
  title: "Unlock book",
  target: "book",
  args: z.strictObject({}),
  run: book => {
    const next = lockBook(book, false)
    return next ? { next, result: {} } : null
  },
})

export const PAGE_LOCK = kit.defineAction({
  id: "page-lock",
  attach: { pages: true },
  aiDescription:
    "Lock a page: while locked, the page and everything on it cannot be changed or removed and its book cannot be moved to the trash, by the user or by AI (refused with locked). Only the user can unlock it. Refused if the page does not exist or is already locked.",
  title: "Lock page",
  target: "book",
  args: PAGE_ARGS,
  run: (book, args) => {
    const next = lockPage(book, args.page, true)
    return next ? { next, result: {} } : null
  },
})

export const PAGE_UNLOCK = kit.defineAction({
  id: "page-unlock",
  attach: { pages: true },
  userOnly: true,
  aiDescription: "Unlock a page (only the user can).",
  title: "Unlock page",
  target: "book",
  args: PAGE_ARGS,
  run: (book, args) => {
    const next = lockPage(book, args.page, false)
    return next ? { next, result: {} } : null
  },
})

// 鍵のアイコンを押したときのコマンド: ステージのブックのロックを外す
export const BOOK_UNLOCK_COMMAND = kit.defineCommand({
  id: "book-unlock",
  performs: [BOOK_UNLOCK.id],
  title: "Unlock book",
  run: (ctx, a) => {
    if (ctx.book) a.perform(BOOK_UNLOCK.id, {}, { book: ctx.book.id })
  },
  when: ctx => ctx.book?.locked === true,
})

// 鍵のアイコンを押したときのコマンド: ステージのブックのページ page のロックを外す
export const PAGE_UNLOCK_COMMAND = kit.defineCommand({
  id: "page-unlock",
  performs: [PAGE_UNLOCK.id],
  title: "Unlock page",
  run: (ctx, a, page: string) => {
    if (ctx.book) a.perform(PAGE_UNLOCK.id, { page }, { book: ctx.book.id })
  },
  when: ctx => ctx.book !== null && hasPages(ctx.book),
})
