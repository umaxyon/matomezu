// アクションの結果を整え、形と決まりと認可ステップの守らせること（keeps）を確かめる（ページ・ブック・書庫・レコード）

import { distinctBooks, findPage, foundPage, holds, NO_PAGE, pageSettles, pagesOf, putPage } from "./book"
import { changesOf, type LibraryPageRows, pageChangeOf } from "./changes"
import type { CoreCatalog } from "./core-catalog"
import type { ActionContext, ActionDef } from "./def/action"
import type { BackyardEntries, PagePermissionCheck, PlaceChange } from "./def/permission"
import type { SubjectDef } from "./def/subject"
import { backyardEntryOf, binnedBetween } from "./entries"
import type { Folders, Library } from "./folders"
import { bookIdOf, foldersOver, inTrash, permissionFoldersOf } from "./folders-tree"
import type { Books } from "./library"
import { inputFor } from "./permission-input"
import type { ItemPage } from "./placed"
import { sourceIn } from "./record-source"
import { NO_RECORD, REMOVED } from "./records"
import { referredOf } from "./refs"
import type { Book } from "./schema/book"
import { settledAfter } from "./settle"

// アクションの前のページ before（作ったページなら undefined）と run が返したページ after を、ノーマライズステップ（core/def/normalize-step.ts）を順にかけて整えたもの。
// run がステップだけが書くページのフィールドを変えていたら（前の状態に戻すアクションを除く）、または整えられなければ null
export function normalizedPage(
  catalog: CoreCatalog,
  action: ActionDef,
  before: ItemPage | undefined,
  after: ItemPage,
): ItemPage | null {
  const changed = new Set(pageChangeOf(after.id, before, after).fields)
  let next: ItemPage | null = after
  for (const step of catalog.normalizeSteps) {
    if (!step.restoring?.includes(action.id) && step.pageFields.some(f => changed.has(f))) return null
    next = next && step.normalize(before ?? NO_PAGE, next, catalog)
  }
  return next
}

// アクションが返したブック after のページを 1 枚ずつ、行う前のブック before の同じページと比べて整えたブック（どれかが整えられなければ null）
export function normalized(catalog: CoreCatalog, action: ActionDef, before: Book, after: Book): Book | null {
  let next = after
  for (const page of pagesOf(after)) {
    const done = normalizedPage(catalog, action, foundPage(findPage(before, page.id)), page)
    if (!done) return null
    if (done !== page) next = putPage(next, done)
  }
  return next
}

// アクションが返したブックが、機能台帳のブックの形に合い、データの形の外の決まりも守っているか（型を言い張った所があっても、ここで止める）
export function settles(catalog: CoreCatalog, book: Book): boolean {
  return catalog.bookSchema.safeParse(book).success && holds(catalog, book)
}

// 書庫が対象のアクションの結果で、変わったブックが（置いた鍵がブックの id で）形に合っていて、ブックどうしで id（ブック・ページ・バインダ）が重ならないか
// （ページもフォルダも、ちょうど 1 つのフォルダに入る。作ったブックのページの id が、ほかのブックのページの id と重なれば断る）
export function librarySettles(catalog: CoreCatalog, before: Books, after: Books): boolean {
  return (
    Object.entries(after).every(([key, b]) => b.id === key) &&
    distinctBooks(Object.values(after)).warnings.length === 0 &&
    settledAfter(Object.values(before), Object.values(after), b => settles(catalog, b))
  )
}

// アクションの結果が、認可ステップの守らせること（keeps）を守っているか。守っていなければ、守らせたステップの id
// backyardEntry は、前と後のブックのバックヤードの印と workKey
export function broken(
  ctx: ActionContext,
  action: ActionDef,
  before: Book | undefined,
  after: Book | undefined,
  backyardEntry: BackyardEntries,
  place: PlaceChange = "same",
  rows?: LibraryPageRows,
): string | null {
  const changes = changesOf(before, after, { place, ...(rows ? { rows } : {}) })
  for (const p of ctx.catalog.permissions.values())
    if (
      p.keeps &&
      !p.keeps(
        { kind: "folder", action, before, after, changes, backyardEntry, actor: ctx.actor },
        inputFor(ctx.catalog, ctx, p),
      )
    )
      return p.id
  return null
}

// 前のフォルダ was のブック from と、後のフォルダ now のブック to の、バックヤードの印と workKey（ブックが無い側は無い）
export function backyardEntriesBetween(
  was: Folders,
  from: string | undefined,
  now: Folders,
  to: string | undefined,
): BackyardEntries {
  const before = from === undefined ? undefined : backyardEntryOf(was, from)
  const after = to === undefined ? undefined : backyardEntryOf(now, to)
  return { ...(before ? { before } : {}), ...(after ? { after } : {}) }
}

// ページの変化 page（PagePermissionCheck の、アクションと行う者を除いた物）が、認可ステップの守らせること（keeps）を守っているか。守っていなければ、守らせたステップの id
export function brokenPage(ctx: ActionContext, action: ActionDef, page: PageCheck): string | null {
  for (const p of ctx.catalog.permissions.values())
    if (p.keeps && !p.keeps({ kind: "page", action, ...page, actor: ctx.actor }, inputFor(ctx.catalog, ctx, p)))
      return p.id
  return null
}

type PageCheck = Omit<PagePermissionCheck, "kind" | "action" | "actor">

// 書庫 library の中のページ id の居場所: ブックの中か、ブックの外か（表に無ければ undefined）
const pagePlaceIn = (library: Library, id: string): "book" | "outside" | undefined =>
  !(id in library.pages) ? undefined : bookIdOf(library.folders, id) === undefined ? "outside" : "book"

// 書庫が was から next に変わる間に、変わった・足したブックの外のページ（ゴミ箱の中も）が、どれもページの形と決まりに合うか。
// ステージエントリが持つ設定の項目の値を受けるのは、ブックの外のページ 1 枚だけ（ブックの外のバインダの中のページが持てば、形に合わない）
// （ブックの中のページは、ブックの確かめ librarySettles が見る。タイプを変えていないかは、置き場所に依らず keepsTypesIn が見る）
export function outsidePagesSettle(catalog: CoreCatalog, was: Library, next: Library): boolean {
  return Object.entries(next.pages).every(([id, page]) => {
    const before = was.pages[id]
    if (before === page || pagePlaceIn(next, id) !== "outside") return true
    const stageEntry = permissionFoldersOf(next.folders, id).length === 0
    return pageSettles(catalog, page, stageEntry)
  })
}

// 書庫 library のページ id の、認可ステップに見せる値（ゴミ箱の中のページは無い物）
function checkedPage(library: Library, id: string): ItemPage | undefined {
  const row = library.pages[id]
  return row && !inTrash(library.folders, id) ? row : undefined
}

// 書庫が was から now に変わる間の、ブックの外で変わったページと、ブックとの間を出入りしたページの確かめ（ブックの中だけに在ったページは入れない）。
// 値も置き場所も変わらないページは入れない
export function pageChecksBetween(was: Library, now: Library): PageCheck[] {
  const binned = binnedBetween(was, now)
  const ids = new Set([...Object.keys(was.pages), ...Object.keys(now.pages)])
  return [...ids].flatMap(id => {
    const from = pagePlaceIn(was, id)
    const to = pagePlaceIn(now, id)
    if (from !== "outside" && to !== "outside") return []
    const before = checkedPage(was, id)
    const after = checkedPage(now, id)
    const place = from && to ? placeChangeOf(was, now, id, binned) : "same"
    if ((!before && !after) || (before === after && place === "same")) return []
    return [
      {
        before,
        after,
        folders: {
          before: from ? permissionFoldersOf(was.folders, id) : [],
          after: to ? permissionFoldersOf(now.folders, id) : [],
        },
        change: pageChangeOf(id, before, after),
        place,
        backyardEntry: backyardEntriesBetween(
          was.folders,
          bookIdOf(was.folders, id),
          now.folders,
          bookIdOf(now.folders, id),
        ),
      },
    ]
  })
}

// レコードが対象のアクションの結果が、認可ステップの守らせること（keeps）を守っているか。前後のレコードが指すほかのレコードを、読み口から引いて渡す。
// 守っていなければ、守らせたステップの id。引けなければ "unreadable"。by が "follow" なら、フォローステップが応じた変わりで、followed を持つステップだけをかける
export function brokenRecord(
  ctx: ActionContext,
  action: ActionDef,
  subject: string,
  before: unknown,
  after: unknown,
  by: "action" | "follow" = "action",
): string | "unreadable" | null {
  const reads = ctx.records ?? {}
  const source = sourceIn(ctx)
  const was = referredOf(ctx.catalog, subject, before, reads, source)
  const now = referredOf(ctx.catalog, subject, after, reads, source)
  if (was === "unreadable" || now === "unreadable") return "unreadable"
  const refs = [...was, ...now.filter(n => !was.some(w => w.subject === n.subject && w.id === n.id))]
  for (const p of ctx.catalog.permissions.values())
    if (
      p.keeps &&
      (by === "action" || p.followed) &&
      !p.keeps(
        {
          kind: "record",
          action,
          subject,
          def: ctx.catalog.subjects.get(subject) as SubjectDef,
          before,
          after,
          refs,
          actor: ctx.actor,
        },
        inputFor(ctx.catalog, ctx, p),
      )
    )
      return p.id
  return null
}

// 書庫が was から now に変わる間の、エントリ id の置き場所の変化
export function placeChangeOf(
  was: Library,
  now: Library,
  id: string,
  binned: ReturnType<typeof binnedBetween>,
): PlaceChange {
  if (binned.trashed.includes(id)) return "trashed"
  if (binned.restored.includes(id)) return "restored"
  const before = foldersOver(was.folders, id)
  const after = foldersOver(now.folders, id)
  return before.length === after.length && before.every((f, i) => f.id === after[i]?.id) ? "same" : "moved"
}

// アクションの対象が、対象の定義が足した種類か
export const isRecordTarget = (catalog: CoreCatalog, target: string): boolean => catalog.subjects.has(target)

// レコードが対象のアクションの結果 next が形を守っているか: 新しいレコードは種類の形に合い、id は変わらず（作るときは新しい id）、消すなら now がある。
// 種類が形のほかの確かめ（対象の定義の check）を書いていれば、それにも通る（郵便なら、郵便の種類が機能台帳にあって、その形にも合う）
export function recordSettles(catalog: CoreCatalog, target: string, now: unknown, next: unknown): boolean {
  if (next === REMOVED) return now !== NO_RECORD
  const def = catalog.subjects.get(target)
  const fits = def?.record.safeParse(next)
  if (!fits?.success) return false
  if (def?.check && def.check(next, catalog).length > 0) return false
  return now === NO_RECORD || (now as { id: string }).id === (next as { id: string }).id
}
