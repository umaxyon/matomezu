// ロック: ブックとページに掛ける「変えない」印（locked は土台のフィールド）。ロック中は利用者も AI も中身を変えられず、ゴミ箱へも入れられない（止めるのは認可ステップ LOCK）。
// 掛けるのは利用者も AI もでき、外すのは利用者だけ（userOnly）
import { z } from "zod"
import { isAI } from "../../../core/actor"
import { findPage, pagesOf } from "../../../core/book"
import type { CatalogCheckDef } from "../../../core/core-catalog"
import type { Where } from "../../../core/def/action"
import type { PermissionCheck } from "../../../core/def/permission"
import { problem } from "../../../core/errors"
import type { ItemPage } from "../../../core/placed"
import { sameData } from "../../../core/same"
import type { Book } from "../../../core/schema/book"
import { kit } from "../kit"
import { setField } from "../utils/fields"

declare module "../../../core/catalog" {
  interface SubjectExtras {
    lockable?: true // このレコードにロックを掛けられる（record に locked: true を持つ項目を書く）。ロック中のレコードは、ロックの掛け外しのアクションのほかを断る
  }
  interface ActionExtras {
    lockSwitch?: true // レコードのロックを掛け外しするアクション（ロック中のレコードに行える。外すのは利用者だけ）
  }
}

// lockable の種類は record に locked（true、省ける）を持ち、lockSwitch はロックできる種類のアクションだけが書く（台帳アセンブルのときの確かめ）
export const LOCKABLE_CHECK: CatalogCheckDef = catalog => [
  ...[...catalog.subjects.values()]
    .filter(s => s.lockable && !("locked" in s.record.shape))
    .map(s => problem("E048", { id: s.id })),
  ...[...catalog.actions.values()]
    .filter(a => a.lockSwitch && !catalog.subjects.get(a.target)?.lockable)
    .map(a => problem("E049", { id: a.id })),
]

const lockBook = (book: Book, on: boolean): Book | null =>
  !!book.locked === on ? null : setField(book, ["title"], "locked", on ? true : undefined)

const lockPage = (page: ItemPage, on: boolean): ItemPage | null =>
  !!page.locked === on ? null : setField(page, ["orientation"], "locked", on ? true : undefined)

const PAGE_ARGS = z.strictObject({})

export const BOOK_LOCK = kit.defineAction({
  id: "book-lock",
  history: false,
  inPrintPreview: "runs", // 印刷プレビューの右サイドパネルから掛け外す
  attach: { books: true },
  aiDescription: `Lock the book: while locked, nothing in it can be changed and it cannot be moved to the trash, by the user or by AI (denied by ${kit.name("lock")}). Only the user can unlock it. Refused if it is already locked.`,
  title: "Lock book",
  target: "book",
  permissionScope: "book",
  args: z.strictObject({}),
  run: book => {
    const next = lockBook(book, true)
    return next ? { next, result: {} } : null
  },
})

export const BOOK_UNLOCK = kit.defineAction({
  id: "book-unlock",
  history: false,
  inPrintPreview: "runs",
  attach: { books: true },
  userOnly: true,
  aiDescription: "Unlock the book (only the user can).",
  title: "Unlock book",
  target: "book",
  permissionScope: "book",
  args: z.strictObject({}),
  run: book => {
    const next = lockBook(book, false)
    return next ? { next, result: {} } : null
  },
})

export const PAGE_LOCK = kit.defineAction({
  id: "page-lock",
  history: false,
  attach: { pages: true },
  aiDescription: `Lock a page: while locked, the page and everything on it cannot be changed or removed and its book (or the page itself, when it is not in a book) cannot be moved to the trash, by the user or by AI (denied by ${kit.name("lock")}). Only the user can unlock it. Refused if the page is already locked.`,
  title: "Lock page",
  target: "page",
  args: PAGE_ARGS,
  permissionScope: "page",
  run: page => {
    const next = lockPage(page, true)
    return next ? { next, result: {} } : null
  },
})

export const PAGE_UNLOCK = kit.defineAction({
  id: "page-unlock",
  history: false,
  attach: { pages: true },
  userOnly: true,
  aiDescription: "Unlock a page (only the user can).",
  title: "Unlock page",
  target: "page",
  args: PAGE_ARGS,
  permissionScope: "page",
  run: page => {
    const next = lockPage(page, false)
    return next ? { next, result: {} } : null
  },
})

// ロック中のブックで行えるのはブックのロックの掛け外しだけ、ロック中のページに対して行えるのはそのページのロックの掛け外しだけ
const BOOK_SWITCHES: readonly string[] = [BOOK_LOCK.id, BOOK_UNLOCK.id]
const PAGE_SWITCHES: readonly string[] = [PAGE_LOCK.id, PAGE_UNLOCK.id]
// ロックを掛けるアクション（バックヤードのブックとその中のページには、利用者も行えない）
const LOCKS: readonly string[] = [BOOK_LOCK.id, PAGE_LOCK.id]

// 前のブック before（無ければ新しく増えた）から後のブック after で、ブックかそのページに、新しくロックが掛かったか
function lockedAnew(before: Book | undefined, after: Book): boolean {
  if (after.locked && !before?.locked) return true
  const was = new Set((before ? pagesOf(before) : []).filter(p => p.locked).map(p => p.id))
  return pagesOf(after).some(p => p.locked && !was.has(p.id))
}

// ロック中のブックかページの変わったフィールド fields が、ロックの印だけで、印を外したのが利用者の、掛け外しのアクション switches か
// （next は変わった後のブックかページ。置き直しのように、変える所を前もって言えないアクションも、印を外せない）
const onlySwitched = (
  fields: readonly string[],
  next: { locked?: true } | undefined,
  actor: PermissionCheck["actor"],
  action: string,
  switches: readonly string[],
) =>
  fields.every(f => f === "locked") &&
  !(fields.includes("locked") && !next?.locked && (isAI(actor) || !switches.includes(action)))

// ロック中のレコードは、ロックの印を掛け外すほかは変えず、消さない。外せるのは利用者だけ（印を掛け外すアクションかは、印でなく実際の変化で見る）。作るレコードは、ロックを掛けて作ってもよい
function recordKeeps(c: Extract<PermissionCheck, { kind: "record" }>): boolean {
  if (!c.def.lockable || c.before === "none") return true
  const before = c.before as { locked?: true }
  if (!before.locked) return true
  if (c.after === "removed") return false
  const after = c.after as { locked?: true }
  const { locked: _, ...was } = before
  const { locked: __, ...now } = after
  if (!sameData(was, now)) return false
  return !(isAI(c.actor) && !after.locked)
}

// ブックの外で変わったページと、ブックとの間を出入りしたページ（kind "page"）: ロック中のページは、動かせるが、消さず、ゴミ箱に入れず、ロックの掛け外しのほかは変えない
// （ブックの中のページと同じ決まり。ロックを外せるのは利用者だけ）
function pageKeeps(c: Extract<PermissionCheck, { kind: "page" }>): boolean {
  if (!c.before?.locked) return true
  if (!c.after || c.place === "trashed") return false
  return c.change.items.length === 0 && onlySwitched(c.change.fields, c.after, c.actor, c.action.id, PAGE_SWITCHES)
}

// フォルダで問う問いの所 where が名指すページ（名指さない・そのブックに無ければ undefined）
const pageAt = (folder: Book, where: Where | undefined) =>
  where?.page === undefined ? undefined : findPage(folder, where.page)?.page

export const LOCK = kit.definePermission({
  id: "lock",
  title: "Locked",
  aiDescription:
    "the book or a page it would change is locked; nothing in it can be changed until it is unlocked, and only the user can unlock it, so ask the user in the chat. A worker book and its pages cannot be locked at all, by the user either",
  // 変える所が分からないアクションは、ページのロックでは止めない（行った後の keeps が止める）。ページを含むブックの全部を変えるなら、どれかのページがロック中で止める。
  // アノテーションは図の中身ではないので止めない
  denies: q => {
    if (q.kind === "record")
      return (
        q.def.lockable === true &&
        q.record !== "none" &&
        !!(q.record as { locked?: true }).locked &&
        !q.action.lockSwitch
      )
    // 置き場所はロックで止めない（ロックした物も、動かせる）
    if (q.kind === "place" || q.action.target === "annotations") return false
    // バックヤードのブックとその中のページは、利用者もロックできない
    if (q.backyardEntry && LOCKS.includes(q.action.id)) return true
    if (q.kind === "page") {
      // ページを入れているブックがロック中なら、そのページのロックの掛け外しも止める
      if (q.folders.some(f => f.folderRole === "book" && f.locked)) return true
      // エントリとして動かす・複製するだけなら、ロックしたページも止めない（名前を変える・中身ごと変えるのは止める）
      if (q.where?.entry === "place" || q.where?.entry === "copy") return false
      return !!q.page.locked && !PAGE_SWITCHES.includes(q.action.id)
    }
    if (q.kind !== "folder") return false
    const { action, folder, where } = q
    if (where?.place) return false // 置き場所だけを変える（ロックした物も、動かせる）
    if (folder.locked) return !BOOK_SWITCHES.includes(action.id)
    if (where?.allPages) return pagesOf(folder).some(p => p.locked)
    // ロックしたページは、エントリとして動かせるが、名前は変えない
    if (where?.entriesChange === "title") return (where.entries ?? []).some(id => findPage(folder, id)?.page.locked)
    return pageAt(folder, where)?.locked === true && !PAGE_SWITCHES.includes(action.id)
  },
  // フォローステップが応じた変わりも、ロック中のレコードを変えるならきっかけのアクションごと止める（ロックは利用者の物なので、応じる側も越えない）
  followed: true,
  // バックヤードのブック（行った後にバックヤードに在るブック）は、ブックにもページにも新しくロックを掛けない。
  // ロック中のブックは、ロックの掛け外しのほかは変えない。ロック中のページは、ロックの掛け外しのほかは変えず、消さず、
  // ブックごとゴミ箱にも入れない（中身を変えずに、ほかのブックへ動かすのはよい）。ロックを外せるのは利用者だけ
  keeps: c => {
    if (c.kind === "record") return recordKeeps(c)
    if (c.kind === "page") return pageKeeps(c)
    if (c.kind !== "folder") return true
    const { before, after, changes, actor, action } = c
    if (c.backyardEntry.after && after && lockedAnew(before, after)) return false
    if (!before) return true // 新しく増えたブックは、ロックを掛けて作ってもよい
    const locked = pagesOf(before).filter(p => p.locked)
    if (!before.locked && locked.length === 0) return true
    if (changes.gone || changes.place === "trashed") return false
    // ロックしたブックは、ページの中身も、並び（順・バインダの足し引きと名前）も変えない
    if (
      before.locked &&
      (changes.pages.length > 0 ||
        changes.lineup ||
        !onlySwitched(changes.fields, after, actor, action.id, BOOK_SWITCHES))
    )
      return false
    const next = new Map((after ? pagesOf(after) : []).map(p => [p.id, p]))
    return locked.every(p => {
      const c = changes.pages.find(x => x.id === p.id)
      return (
        !c ||
        // ほかのブックへ動かすのはよい（中身は変えない）
        ((c.change === "changed" || c.change === "movedOut") &&
          c.items.length === 0 &&
          onlySwitched(c.fields, next.get(p.id), actor, action.id, PAGE_SWITCHES))
      )
    })
  },
})
