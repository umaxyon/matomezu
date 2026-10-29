// ロック: ブックとページに掛ける「変えない」印（locked は土台のフィールド）。ロック中は利用者も AI も中身を変えられず、ゴミ箱へも入れられない（止めるのは許可の段 LOCK）。
// 掛けるのは利用者も AI もでき、外すのは利用者だけ（userOnly）
import { z } from "zod"
import { hasPages, putPage } from "../../../core/book"
import type { PermissionCheck } from "../../../core/def/permission"
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
  aiDescription: `Lock the book: while locked, nothing in it can be changed and it cannot be moved to the trash, by the user or by AI (denied by ${kit.name("lock")}). Only the user can unlock it. Refused if it is already locked.`,
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
  aiDescription: `Lock a page: while locked, the page and everything on it cannot be changed or removed and its book cannot be moved to the trash, by the user or by AI (denied by ${kit.name("lock")}). Only the user can unlock it. Refused if the page does not exist or is already locked.`,
  title: "Lock page",
  target: "book",
  args: PAGE_ARGS,
  touches: args => ({ page: args.page }),
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
  touches: args => ({ page: args.page }),
  run: (book, args) => {
    const next = lockPage(book, args.page, false)
    return next ? { next, result: {} } : null
  },
})

const pagesOf = (book: Book): readonly { id: string; locked?: true }[] => (hasPages(book) ? book.pages : [])

// ロック中のブックで行えるのはブックのロックの掛け外しだけ、ロック中のページに対して行えるのはそのページのロックの掛け外しだけ
const BOOK_SWITCHES: readonly string[] = [BOOK_LOCK.id, BOOK_UNLOCK.id]
const PAGE_SWITCHES: readonly string[] = [PAGE_LOCK.id, PAGE_UNLOCK.id]

// 変わったのがロックの印だけで、AI がロックを外していないか（next は変わった後のブックかページ）
const onlySwitched = (fields: readonly string[], next: { locked?: true } | undefined, by: PermissionCheck["by"]) =>
  fields.every(f => f === "locked") && !(by === "ai" && fields.includes("locked") && !next?.locked)

export const LOCK = kit.definePermission({
  id: "lock",
  title: "Locked",
  aiDescription:
    "the book or a page it would change is locked; nothing in it can be changed until it is unlocked, and only the user can unlock it, so ask the user in the chat",
  // 変える所が分からないアクションは、ページのロックでは止めない（行った後の keeps が止める）
  denies: ({ action, book, where }) => {
    if (book.locked) return !BOOK_SWITCHES.includes(action.id)
    const page = where?.page
    const locked = page !== undefined && pagesOf(book).some(p => p.id === page && p.locked)
    return locked && !PAGE_SWITCHES.includes(action.id)
  },
  // ロック中のブックは、ロックの掛け外しのほかは変えない。ロック中のページは、ロックの掛け外しのほかは変えず、消さず、
  // ブックごとゴミ箱にも入れない。ロックを外せるのは利用者だけ
  keeps: ({ before, after, changes, by }) => {
    const locked = pagesOf(before).filter(p => p.locked)
    if (!before.locked && locked.length === 0) return true
    if (changes.gone || changes.fields.includes("trashed")) return false
    if (before.locked && (changes.pages.length > 0 || !onlySwitched(changes.fields, after, by))) return false
    const next = new Map((after ? pagesOf(after) : []).map(p => [p.id, p]))
    return locked.every(p => {
      const c = changes.pages.find(x => x.id === p.id)
      return !c || (c.change === "changed" && c.items.length === 0 && onlySwitched(c.fields, next.get(p.id), by))
    })
  },
})
