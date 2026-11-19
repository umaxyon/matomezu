// アクションを行う、データを変える入口。対象で使えるアクションかと引数の形を確かめてから run する。
// 使えるかは、book・page・annotations が対象ならアクションが名指すページのタイプ（名指さなければ、タイプに依らない付く先だけ）、library・settings と対象の定義の種類が対象ならインスタンスのコントロールセンターが決める（コントロールセンターが無ければ断る）。
// その前に認可ステップ（core/def/permission.ts）が止められ、run の結果も認可ステップが守らせることを守っていなければ断る（denied）

import type { z } from "zod"
import { isAI, USER } from "./actor"
import { type Annotation, type Annotations, annotationsSettle, type PageAnnotations, prune } from "./annotation"
import {
  distinctBooks,
  findPage,
  findUnreadable,
  holds,
  keepsPageTypes,
  keepsPageTypesAcross,
  lostUnreadable,
  pagesOf,
  putPage,
} from "./book"
import type { ActionId, ActionTable } from "./catalog"
import { changesOf, type LibraryPageRows } from "./changes"
import { type CoreCatalog, pageType } from "./core-catalog"
import {
  type ActionContext,
  type ActionDef,
  type ActionOn,
  type ActionTarget,
  type AIEditTicketChange,
  type AIMessage,
  type AnyLibraryScope,
  type AnyPagePermissionScope,
  type AnyPermissionScope,
  type AnySettingsScope,
  type Declined,
  type Done,
  type EntryWhere,
  libraryScopeOf,
  type OtherRecord,
  pageScopeOf,
  pagesScopeOf,
  type SubjectData,
  type Subjects,
  scopeOf,
  settingsScopeOf,
  type Where,
} from "./def/action"
import type { PlaceChange, Referred } from "./def/permission"
import type { SubjectDef } from "./def/subject"
import { binnedBetween, isWithin, namingFor, namingOf, TITLE_TAKEN, titleClashes } from "./entries"
import {
  bookIdOf,
  bookOf,
  changesBetween,
  createdIn,
  foldersOver,
  homeOrFolderHolds,
  inTrash,
  isKeptSystemFolder,
  isOpenRole,
  type Library,
  libraryOf,
  noChanges,
  placedChanges,
  rowChanges,
  systemFolderOf,
  type TableChanges,
  treeHolds,
  withBook,
  withChanges,
} from "./folders"
import { idsIn, skipping } from "./ids"
import { decidedByPlace, deniedBy, type Inspected, inspect, typeAllows, withoutPermissions } from "./inspect"
import type { Books } from "./library"
import type { ItemPage } from "./placed"
import { type RecordSource, readFrom, SOURCE, sourceIn, sourceOf, type WithSource } from "./record-source"
import { type Counters, NO_RECORD, RECORDS_MAX, REMOVED, type RecordChange, type Records } from "./records"
import { referredOf } from "./refs"
import { sameData } from "./same"
import type { Book, Page, UnreadableCode, UnreadableEntry } from "./schema/book"
import type { Settings } from "./settings"
import { settledAfter } from "./settle"

type ActionOf<Id extends ActionId> = ActionTable[Id]
export type TargetOf<Id extends ActionId> = ActionOf<Id>["target"]
// ページが対象のアクションを行うときに渡す対象: ページを持っているブックと、そのページの id（run が受けるのは、そのページだけ）
export interface PageInBook {
  book: Book
  page: string
}
// ページのアノテーションが対象のアクションを行うときに渡す対象: ページを持っているブックと、そのページの id と、そのページのアノテーションの並び
// （run が受けるのは、そのページと並び）
export interface AnnotationsInBook extends PageInBook {
  annotations: readonly Annotation[]
}
export type SubjectOf<Id extends ActionId> =
  TargetOf<Id> extends "page"
    ? PageInBook
    : TargetOf<Id> extends "annotations"
      ? AnnotationsInBook
      : SubjectData<TargetOf<Id>>
// 行った後の対象（ページが対象のアクションは、ページを替えたブック）
export type NextOf<Id extends ActionId> = TargetOf<Id> extends "page" ? Book : SubjectData<TargetOf<Id>>
export type ArgsOf<Id extends ActionId> = z.input<ActionOf<Id>["args"]>
export type ResultOf<Id extends ActionId> =
  ActionOf<Id> extends ActionDef<infer _T, infer _A, infer R, infer _I> ? R : never

// denied は認可ステップが止めたこと（permission はそのステップの id）。refused の detail・kind は、run が添えた断った理由の文と断りの種類（def/action.ts の Declined）。not-allowed で止めたのが利用者の設定の項目ごとのステップなら、
// setting にその項目の id、because に理由（user-only は利用者だけが変える項目、fixed はコントロールセンターが変えさせない項目）
export type Refusal = "unknown" | "not-allowed" | "bad-args" | "refused"
export type NotAllowed = {
  ok: false
  reason: "not-allowed"
  setting?: string
  because?: "user-only" | "fixed" | "not-joined"
}
// 宛先のページが無い（ブックのどこにも無い・ゴミ箱のブックにある・2 冊にある）。detail は AI への説明に載る英語の文
export type NoPage = { ok: false; reason: "no-page"; detail: string }
// 読めないページには何もできない: 宛先が読めないページ page か、アクションが読めないページ page を変えよう（動かす・消す・足す）とした。code は読めない理由の warning の番号
export type Unreadable = { ok: false; reason: "unreadable"; page: string; code: UnreadableCode }
export type Refused =
  | { ok: false; reason: Exclude<Refusal, "not-allowed" | "refused"> }
  | NoPage
  | Unreadable
  | { ok: false; reason: "refused"; detail?: string; kind?: string } // kind は断りの種類（run が添えた名前か、土台の種類。土台の種類は名前空間が付かない）
  | NotAllowed
  | Denied
// others はレコードが対象のアクションが、宛先のほかに変えたレコード（同じ種類か、writes に書いた種類。確かめ終えた物）
export type Performed<Id extends ActionId> =
  | {
      ok: true
      next: NextOf<Id>
      result: ResultOf<Id>
      others?: readonly OtherRecord<never>[]
      aiEditTickets?: readonly AIEditTicketChange[]
      aiMessages?: readonly AIMessage[]
    }
  | Refused

// タイプ type のページで使えるアクション（表の並び）: タイプが選んだ物に付くアクションとタイプが足すアクションから、タイプが外すアクションを除く（inspect と同じ決まり）。
// ブック自身だけを変えるアクション（許可スコープが "book"）は、タイプでは決まらないので、タイプに依らない付く先（attach の books）だけで並べる
export function actionsOfPage(catalog: CoreCatalog, page: Pick<Page, "type">): readonly string[] {
  const t = pageType(catalog, page.type)
  return [...catalog.actions.values()]
    .filter(a => (a.target === "book" && a.permissionScope === "book" ? a.attach?.books === true : typeAllows(a, t)))
    .map(a => a.id)
}

// アクションが返したブック after を、ノーマライズステップ（core/def/normalize-step.ts）を順にかけて整えたもの。
// run がステップだけが書くページのフィールドを変えていたら（前の状態に戻すアクションを除く）、または整えられなければ null
function normalized(catalog: CoreCatalog, action: ActionDef, before: Book, after: Book): Book | null {
  const changed = new Set(changesOf(before, after).pages.flatMap(p => p.fields))
  let next: Book | null = after
  for (const step of catalog.normalizeSteps) {
    if (!step.restoring?.includes(action.id) && step.pageFields.some(f => changed.has(f))) return null
    next = next && step.normalize(before, next, catalog)
  }
  return next
}

// アクションが返したブックが、機能台帳のブックの形に合い、データの形の外の決まりも守っているか（型を言い張った所があっても、ここで止める）
function settles(catalog: CoreCatalog, book: Book): boolean {
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
function broken(
  ctx: ActionContext,
  action: ActionDef,
  before: Book | undefined,
  after: Book | undefined,
  place: PlaceChange = "same",
  rows?: LibraryPageRows,
): string | null {
  const changes = changesOf(before, after, { place, ...(rows ? { rows } : {}) })
  for (const p of ctx.catalog.permissions.values())
    if (p.keeps && !p.keeps({ kind: "folder", action, before, after, changes, actor: ctx.actor })) return p.id
  return null
}

// レコードが対象のアクションの結果が、認可ステップの守らせること（keeps）を守っているか。前後のレコードが指すほかのレコードを、読み口から引いて渡す。
// 守っていなければ、守らせたステップの id。引けなければ "unreadable"
function brokenRecord(
  ctx: ActionContext,
  action: ActionDef,
  subject: string,
  before: unknown,
  after: unknown,
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
      !p.keeps({
        kind: "record",
        action,
        subject,
        def: ctx.catalog.subjects.get(subject) as SubjectDef,
        before,
        after,
        refs,
        actor: ctx.actor,
      })
    )
      return p.id
  return null
}

// 書庫が対象のアクションが名指したエントリ entry を where のとおりに変えるとき、行う前に問うブックと、その中の所:
// ブックならそのブック、フォルダなら中のブックの全部（名前だけ・写すだけなら、どれにも問わない）、ブックの中のページ・バインダなら、そのブックのそのエントリ
// （動かす・名前を変えるなら、その印 entriesChange を添える）。into（動かす先のフォルダ）がほかのブックかその中なら、そのブックにも、入るエントリとして問う
function booksOfEntry(
  library: Library,
  entry: string,
  how: EntryWhere,
  into?: string,
): { book: string; where: Where }[] {
  const where: Where = how === "all-pages" ? { allPages: true } : how === "place" ? { place: true } : {}
  const row = library.folders[entry]
  const from = row?.folderRole === "book" ? entry : bookIdOf(library.folders, entry)
  const to =
    into === undefined
      ? undefined
      : library.folders[into]?.folderRole === "book"
        ? into
        : bookIdOf(library.folders, into)
  // 中身ごと変えるページは、そのページを丸ごと変える所で問う
  const whole = how === "all-pages" && library.pages[entry] !== undefined
  const asked = (book: string) => ({
    book,
    where: whole
      ? ({ page: entry } as Where)
      : ({ entries: [entry], ...(how === "place" || how === "title" ? { entriesChange: how } : {}) } as Where),
  })
  const enters = to !== undefined && to !== from && row?.folderRole !== "book" ? [asked(to)] : []
  if (row?.folderRole === "book") return how === "copy" ? [] : [{ book: entry, where }]
  if (row && isOpenRole(row.folderRole)) {
    if (how === "title" || how === "copy") return []
    return Object.values(library.folders).flatMap(f =>
      f.folderRole === "book" && isWithin(library.folders, f.id, entry) ? [{ book: f.id, where }] : [],
    )
  }
  return [...(from === undefined ? [] : [asked(from)]), ...enters]
}

// 書庫が was から now に変わる間の、エントリ id の置き場所の変化
function placeChangeOf(was: Library, now: Library, id: string, binned: ReturnType<typeof binnedBetween>): PlaceChange {
  if (binned.trashed.includes(id)) return "trashed"
  if (binned.restored.includes(id)) return "restored"
  const before = foldersOver(was.folders, id)
  const after = foldersOver(now.folders, id)
  return before.length === after.length && before.every((f, i) => f.id === after[i]?.id) ? "same" : "moved"
}

// 書庫 library の、ゴミ箱かその中に無いページの行
const pagesOutsideTrash = (library: Library): Library["pages"] =>
  Object.fromEntries(Object.entries(library.pages).filter(([id]) => !inTrash(library.folders, id)))

// 書庫が対象のアクションの結果で、変わったブック・無くなったブック・増えたブックのどれかが守っていなければ、守らせたステップの id と、そのブックの id（増えたブックなら無い）
// was と now は、行う前と後の書庫（置き場所が変わったブックは、値が変わらなくても確かめる。フォルダごとゴミ箱に出入りしたときの、中のブックも）
function brokenIn(
  ctx: ActionContext,
  action: ActionDef,
  was: Library,
  now: Library,
): { permission: string; book?: string } | null {
  const before = libraryOf(was)
  const after = libraryOf(now)
  const binned = binnedBetween(was, now)
  // ブックの間か外と動いたページを、足した・消したでなく、動いた物として渡す（ゴミ箱との出し入れは、足した・消した物のまま）
  const rows: LibraryPageRows = { was: pagesOutsideTrash(was), now: pagesOutsideTrash(now) }
  for (const b of Object.values(before)) {
    const place = after[b.id] ? placeChangeOf(was, now, b.id, binned) : "same"
    const id = b === after[b.id] && place === "same" ? null : broken(ctx, action, b, after[b.id], place, rows)
    if (id) return { permission: id, book: b.id }
  }
  for (const b of Object.values(after)) {
    const made = inTrash(now.folders, b.id) ? "trashed" : "same"
    const id = b.id in before ? null : broken(ctx, action, undefined, b, made, rows)
    if (id) return { permission: id }
  }
  return null
}

// 書庫が対象のアクションが返した書庫 after の、行う前から在って変わったブックを、ノーマライズステップで整えた書庫（どれかが整えられなければ null）。
// before は、行う前の書庫から組んだブック
function normalizedLibrary(catalog: CoreCatalog, action: ActionDef, before: Books, after: Library): Library | null {
  let next = after
  for (const b of Object.values(libraryOf(after))) {
    const was = before[b.id]
    if (!was || was === b) continue
    const tidy = normalized(catalog, action, was, b)
    if (!tidy) return null
    if (tidy !== b) next = withBook(next, tidy)
  }
  return next
}

// 書庫が was から now に変わる間に、システムフォルダの決まりを守るか: 行う前から在るフォルダの行の印（systemFolder）は変わらない（付けも外しもしない）。
// 印の付いた行を足せるのは、印の定義が機能台帳に在るときだけ。定義が機能台帳に在る印の行は、ゴミ箱の外に在れば、ゴミ箱に入れず消さない
// （定義の無い間は、ゴミ箱に入れられる。いくつ在ってよいか・どこに在るかは、木の決まり treeHolds が見る）
function systemFoldersKept(catalog: CoreCatalog, was: Library, now: Library): boolean {
  for (const [id, f] of Object.entries(now.folders)) {
    const before = was.folders[id]
    const mark = systemFolderOf(f)
    if (before ? systemFolderOf(before) !== mark : mark !== undefined && !catalog.systemFolders.has(mark)) return false
  }
  return Object.keys(was.folders).every(
    id =>
      !isKeptSystemFolder(was.folders, id, catalog.systemFolders) ||
      (now.folders[id] !== undefined && !inTrash(now.folders, id)),
  )
}

// 行う前の問いに要る文脈（機能台帳・コントロールセンター・誰が行うか）
// records はレコードが対象のアクションが読む種類のレコード（reads。レコードが指すほかのレコードを引くのに使う）
export type PermitContext = Pick<ActionContext, "catalog" | "controlCenter" | "actor" | "records"> & WithSource

// 使えるかは inspect と同じ決まりで決める（問い合わせの答えと、実際に行えるかを食い違わせない）。利用者の設定が対象なら、許可スコープで引数から出した変える項目の id も渡す。
// 認可ステップに渡すのは、ブックが対象ならそのブックと、アクションの許可スコープ（permissionScope）で引数から出す所（無ければ分からないとして渡す）。
// 書庫が対象なら、許可スコープで引数から出した変えるブックごとに、そのブックとその中の所（作るブックは、空のブック）を渡し、どれかで止められれば止める。
// 書庫の許可スコープが "unknown" なら、認可ステップは行った後の keeps だけで見る
function permits(
  ctx: PermitContext,
  action: ActionDef,
  subject: unknown,
  args: { success: true; data: unknown } | { success: false },
): Permitted & { pages?: readonly string[] } {
  const settings =
    args.success && action.target === "settings"
      ? settingsScopeOf(action.permissionScope as AnySettingsScope, args.data)
      : undefined
  const asking = (
    book: Book | undefined,
    where: Where | undefined,
    record?: { record: unknown; refs: readonly Referred[] },
  ) =>
    inspect(
      ctx.catalog,
      {
        kind: "action",
        action: action.id,
        book,
        ...(where ? { where } : {}),
        ...(settings ? { settings } : {}),
        ...(record ? { record } : {}),
        actor: ctx.actor,
      },
      ctx,
    )
  const asked = (...at: Parameters<typeof asking>) => answerOf(asking(...at))
  if (isRecordTarget(ctx.catalog, action.target)) {
    const refs = referredOf(ctx.catalog, action.target, subject, ctx.records ?? {}, sourceIn(ctx))
    if (refs === "unreadable") return { ok: false, reason: "not-allowed" }
    return asked(undefined, undefined, { record: subject, refs })
  }
  if (action.target === "library") {
    const targets = args.success ? libraryScopeOf(action.permissionScope as AnyLibraryScope, args.data) : null
    const library = libraryOf(subject as Library)
    const named = [
      ...(targets?.books ?? []),
      ...(targets?.entries ?? []).flatMap(e => booksOfEntry(subject as Library, e.entry, e.where, e.into)),
    ]
    const books = named.flatMap(t => {
      const book = library[t.book]
      return book ? [{ book, where: t.where }] : []
    })
    const made = targets?.creates ? [{ book: NEW_BOOK, where: {} }] : []
    const asks = [...books, ...made]
    if (asks.length === 0) return asked(undefined, undefined)
    for (const a of asks) {
      const answer = asked(a.book, a.where)
      if (!answer.ok) return answer.reason === "denied" && a.book !== NEW_BOOK ? { ...answer, book: a.book.id } : answer
    }
    return { ok: true }
  }
  const book =
    action.target === "book"
      ? (subject as Book)
      : action.target === "page" || action.target === "annotations"
        ? (subject as PageInBook).book
        : undefined
  if (action.target === "page") {
    // 所は、宛先のページと、引数が名指す中の物（引数が形に合わなければ、ページだけ）
    const scope = args.success ? (action.permissionScope as AnyPagePermissionScope | undefined) : undefined
    const answer = asking(book, pageScopeOf(scope, (subject as PageInBook).page, args.success ? args.data : undefined))
    return !args.success && answer.value === false && decidedByPlace(answer) ? { ok: true } : answerOf(answer)
  }
  // アノテーションが対象なら、所は宛先のページ
  if (action.target === "annotations") return asked(book, { page: (subject as PageInBook).page })
  if (action.target !== "book") return asked(book, undefined)
  // ページ 1 枚ごとに問う形: 名指したページのうち、止められなかったページを残す。1 枚も残らなければ、最初のページの答えで断る。
  // 名指したページがブックに 1 枚も無ければ、ページでは問わない（無いページは run が断る）
  const named = args.success ? pagesScopeOf(action.permissionScope as AnyPermissionScope | undefined, args.data) : null
  const each = named && book ? pagesOf(book).filter(p => named === "all" || named.includes(p.id)) : []
  if (each.length > 0) {
    const answers = each.map(p => ({ page: p.id, answer: asking(book, { page: p.id }) }))
    const pages = answers.filter(a => a.answer.value === true).map(a => a.page)
    const first = answers[0]
    return pages.length > 0 || !first ? { ok: true, pages } : answerOf(first.answer)
  }
  const answer = asking(book, placeOf(action, args))
  // 引数が形に合わなければ所が出せないので、所のステップ（ページのタイプと付く先）では止めない（行う側が bad-args で断る。認可ステップなどが止めるなら、そちらが先）
  return !args.success && answer.value === false && decidedByPlace(answer) ? { ok: true } : answerOf(answer)
}

// ブックが対象のアクション action の許可スコープが、引数で名指す所（ページ・エントリ・1 枚ごとに問うページ）のうち、最初の読めないページ（無ければ null）。
// 読めないページには何もできないので、行う前に断る
function namedUnreadable(
  action: ActionDef,
  book: Book,
  args: { success: true; data: unknown } | { success: false },
): UnreadableEntry | null {
  if (!args.success) return null
  const where = placeOf(action, args)
  const each = pagesScopeOf(action.permissionScope as AnyPermissionScope | undefined, args.data)
  const ids = [...(where?.page ? [where.page] : []), ...(where?.entries ?? []), ...(Array.isArray(each) ? each : [])]
  return ids.map(id => findUnreadable(book, id)?.entry).find(e => e !== undefined) ?? null
}

// ブックが対象のアクション action が、引数で名指す所（引数が形に合わなければ、分からない）
const placeOf = (action: ActionDef, args: { success: true; data: unknown } | { success: false }): Where | undefined =>
  args.success ? scopeOf(action.permissionScope as AnyPermissionScope | undefined, args.data) : undefined

// ブック book に、ブックが対象のアクション id（ページが対象なら、ブックのページ page に）を引数 args で行えるか、認可ステップを除いて問う
// （宛先のページと引数が名指す所のページのタイプと、アクションの付く先だけで決まる）。引数が形に合わなければ行えない
export function allowedOnBook(catalog: CoreCatalog, book: Book, id: string, args: unknown, page?: string): boolean {
  const action: ActionDef | undefined = catalog.actions.get(id)
  if (action?.target !== "book" && action?.target !== "page") return false
  const parsed = action.args.safeParse(args)
  if (!parsed.success) return false
  if (action.target === "page" && (page === undefined || !findPage(book, page))) return false
  const where =
    action.target === "page"
      ? pageScopeOf(action.permissionScope as AnyPagePermissionScope | undefined, page as string, parsed.data)
      : placeOf(action, parsed)
  const answer = inspect(catalog, { kind: "action", action: id, book, ...(where ? { where } : {}), actor: USER })
  return withoutPermissions(answer).value === true
}

// 作るブックを認可ステップに問うときの、空のブック（問うためだけの物）
const NEW_BOOK: Book = { id: "new-book", title: "new book", lineup: [] }

// 行う前の問いの答え: 使えるか、止めた理由
export type Permitted = { ok: true } | NotAllowed | Denied

// 認可ステップ permission が止めた断り。書庫が対象のアクションでは、どのブックで止めたかを book に持つ（作るブックで止めたなら無い）
export type Denied = { ok: false; reason: "denied"; permission: string; book?: string }

function answerOf(answer: Inspected<boolean>): Permitted {
  if (answer.value === true) return { ok: true }
  const permission = deniedBy(answer)
  if (permission) return { ok: false, reason: "denied", permission }
  const from = answer.decidedBy
  if (from?.source === "participation") return { ok: false, reason: "not-allowed", because: "not-joined" }
  if (from?.source === "userSetting")
    return { ok: false, reason: "not-allowed", setting: from.id, because: "user-only" }
  if (from?.source === "controlCenter" && from.id !== null && from.field === "fixedUserSettings")
    return { ok: false, reason: "not-allowed", setting: from.setting, because: "fixed" }
  return { ok: false, reason: "not-allowed" }
}

// 対象 subject に、アクション id を引数 args で行えるかを、行う前に問う（perform の行う前の確かめと同じ答え。run は回さない）
export function permitted(
  subject: unknown,
  id: string,
  args: unknown,
  ctx: PermitContext,
): Permitted | Refused | Unreadable {
  const action: ActionDef | undefined = ctx.catalog.actions.get(id)
  if (!action) return { ok: false, reason: "unknown" }
  const parsed = action.args.safeParse(args)
  const named = action.target === "book" ? namedUnreadable(action, subject as Book, parsed) : null
  if (named) return unreadable(named)
  const answer = permits(ctx, action, subject as Subjects[keyof Subjects], parsed)
  return answer.ok ? { ok: true } : answer
}

// 宛先のページが無いときの断り（直し方も言う）
export const noPage = (wanted: string): NoPage => ({
  ok: false,
  reason: "no-page",
  detail: `there is no page with the id ${wanted} (on.page is the id of a page; read_book lists a book's pages)`,
})

// 書庫 library の、ページとフォルダの行の id
const rowIdsIn = (library: Library): string[] => [...Object.keys(library.pages), ...Object.keys(library.folders)]

// アクション action の run だけを行う（使えるか・整え・認可ステップ・形の確かめはしない。それは perform がする）。args は引数の形を通した後の値。
// ページが対象なら、対象 subject（PageInBook）のブックからページを探して run に渡し、返ったページを同じ所へ戻したブックを next にする
// （ページが無い・run が id の違うページを返したら null）。アノテーションが対象なら、ページとその並びを run に渡す（ページを替えて返したら null）。
// run が振る id は、ページが対象ならそのページの中のどの id とも、ブックが対象ならそのブックの並びの中のどの id とも、書庫が対象なら書庫のどのページ・フォルダの行の id とも重ならず、同じ値を 2 度渡さない
// （そのままでも短い id にしても重なる newId の値を飛ばす。中身の id がページの中で重ならないことに、アノテーションのアンカーなどが頼っている）

export function runAction(
  action: ActionDef,
  subject: unknown,
  args: unknown,
  ctx: ActionContext,
): Done<ActionTarget, unknown> | Declined | null {
  const run = action.run as (subject: unknown, args: unknown, ctx: ActionContext) => ReturnType<ActionDef["run"]>
  if (action.target === "book")
    return run(subject, args, { ...ctx, newId: skipping(ctx.newId, () => idsIn((subject as Book).lineup)) })
  if (action.target === "library")
    return run(subject, args, { ...ctx, newId: skipping(ctx.newId, () => rowIdsIn(subject as Library)) })
  if (action.target !== "page" && action.target !== "annotations") return run(subject, args, ctx)
  const { book, page: id } = subject as PageInBook
  const page = findPage(book, id)?.page
  if (!page) return null
  if (action.target === "annotations") {
    const ran = run({ page, annotations: (subject as AnnotationsInBook).annotations }, args, ctx)
    return ran && !("declined" in ran) && (ran.next as PageAnnotations).page !== page ? null : ran
  }
  const ran = run(page, args, { ...ctx, newId: skipping(ctx.newId, () => idsIn(page)) })
  if (!ran || "declined" in ran) return ran
  const next = ran.next as ItemPage
  if (next.id !== page.id) return null
  return { ...ran, next: next === page ? book : putPage(book, next) }
}

export function perform<Id extends ActionId>(
  subject: SubjectOf<Id>,
  id: Id,
  args: ArgsOf<Id>,
  ctx: ActionContext,
): Performed<Id> {
  const action: ActionDef | undefined = ctx.catalog.actions.get(id)
  if (!action) return { ok: false, reason: "unknown" }
  if (action.target === "page" || action.target === "annotations") {
    const at = subject as PageInBook
    if (!findPage(at.book, at.page)) return noPage(at.page)
  }
  // ブックを変えるアクション（ブックが対象か、ページが対象）の、行う前のブック
  const before =
    action.target === "book" ? (subject as Book) : action.target === "page" ? (subject as PageInBook).book : undefined
  const parsed = action.args.safeParse(args)
  const named = action.target === "book" ? namedUnreadable(action, subject as Book, parsed) : null
  if (named) return unreadable(named)
  const permitted = permits(ctx, action, subject, parsed)
  if (!permitted.ok) return permitted
  if (!parsed.success) return { ok: false, reason: "bad-args" }
  const ran = runAction(
    action,
    subject,
    parsed.data,
    permitted.pages ? { ...ctx, permittedPages: permitted.pages } : ctx,
  )
  if (!ran) return { ok: false, reason: "refused" }
  if ("declined" in ran)
    return { ok: false, reason: "refused", detail: ran.declined, ...(ran.kind === undefined ? {} : { kind: ran.kind }) }
  // 書庫が対象なら、行う前と後の書庫から組んだブック（確かめは、ブックの値で行う）
  const wasBooks = action.target === "library" ? libraryOf(subject as Library) : undefined
  const next = before
    ? normalized(ctx.catalog, action, before, ran.next as Book)
    : wasBooks
      ? normalizedLibrary(ctx.catalog, action, wasBooks, ran.next as Library)
      : ran.next
  if (!next) return { ok: false, reason: "refused" }
  const done = { ...ran, next }
  const nowBooks = wasBooks ? libraryOf(next as Library) : undefined
  // アノテーションのアクションはページを変えない（変えたら runAction が断る）。認可ステップの keeps は、変わらないブックで見る
  const pair = subject as unknown as AnnotationsInBook
  if (wasBooks && nowBooks) {
    const kept = brokenIn(ctx, action, subject as Library, next as Library)
    if (kept) return { ok: false, reason: "denied", ...kept }
  }
  const permission = before
    ? broken(ctx, action, before, done.next as Book)
    : action.target === "annotations"
      ? broken(ctx, action, pair.book, pair.book)
      : null
  if (permission) return { ok: false, reason: "denied", permission }
  if (before) {
    const lost = lostUnreadable(before, done.next as Book)
    if (lost) return unreadable(lost)
    // ページのタイプは作ったあと変えない（アクションが替えていたら断る）
    if (!settles(ctx.catalog, done.next as Book) || !keepsPageTypes(before, done.next as Book))
      return { ok: false, reason: "refused" }
  }
  if (wasBooks && nowBooks) {
    const was = wasBooks
    const now = nowBooks
    // ブックのフォルダは、どれもブックに組める（並びのエントリの中身が、書庫に在る）
    const built = Object.values((next as Library).folders).every(f => f.folderRole !== "book" || f.id in now)
    if (!built) return { ok: false, reason: "refused" }
    // 変わった書庫ホーム・ゴミ箱・フォルダの行は、形に合う
    const rows = (subject as Library).folders
    const shaped = Object.values((next as Library).folders).every(
      f => !isOpenRole(f.folderRole) || rows[f.id] === f || homeOrFolderHolds(f),
    )
    if (!shaped) return { ok: false, reason: "refused" }
    if (!systemFoldersKept(ctx.catalog, subject as Library, next as Library)) return { ok: false, reason: "refused" }
    // 残るブックの読めないページは、そのまま（無くなるのは、ブックごと消すときだけ。作るブックには入れられない）
    for (const b of Object.values(now)) {
      const lost = was[b.id] === b ? null : lostUnreadable(was[b.id], b)
      if (lost) return unreadable(lost)
    }
    // 行う前から在るページのタイプも、変えない（ページがブックの間を動いても）
    const typesKept = keepsPageTypesAcross(Object.values(was), Object.values(now))
    // 同じ入れ物の中の名前の重なりは、ブックの決まりで断る前に、名前が重なる断りにする
    if (titleClashes(subject as Library, next as Library, namingFor(ctx)).length > 0) return titleTaken
    if (!librarySettles(ctx.catalog, was, now) || !typesKept) return { ok: false, reason: "refused" }
  }
  if (action.target === "annotations") {
    const { page, annotations: next } = done.next as unknown as PageAnnotations
    if (!annotationsSettle(ctx.catalog, page, pair.annotations, next)) return { ok: false, reason: "refused" }
  }
  const others = (ran.others ?? []) as readonly OtherRecord<never>[]
  // 送る AI 間メッセージは、レコードが対象のアクションで、行う者が参加の確定した AI のときだけ（送り手は行った参加者）
  const messages = isRecordTarget(ctx.catalog, action.target) ? (ran.aiMessages ?? []) : []
  if (messages.length > 0 && !(isAI(ctx.actor) && ctx.actor.workroom !== "none"))
    return { ok: false, reason: "refused", detail: "only an AI in a workroom sends AI messages" }
  if (isRecordTarget(ctx.catalog, action.target)) {
    const changes = recordChanges(ctx, action, subject, done.next, others)
    if (!changes) return { ok: false, reason: "refused" }
    // 変える全部に、形・郵便の種類・認可ステップの守らせることをかける（どれか 1 つでも合わなければ、全部を断る）
    for (const c of changes) {
      if (!recordSettles(ctx.catalog, c.subject, c.now, c.next)) return { ok: false, reason: "refused" }
      const kept = brokenRecord(ctx, action, c.subject, c.now, c.next)
      if (kept === "unreadable") return { ok: false, reason: "refused" }
      if (kept) return { ok: false, reason: "denied", permission: kept }
    }
  } else if (others.length > 0) return { ok: false, reason: "refused" }
  return {
    ok: true,
    next: done.next,
    result: done.result,
    ...(others.length > 0 ? { others } : {}),
    ...(isRecordTarget(ctx.catalog, action.target) && ran.aiEditTickets && ran.aiEditTickets.length > 0
      ? { aiEditTickets: ran.aiEditTickets }
      : {}),
    ...(messages.length > 0 ? { aiMessages: messages } : {}),
  } as Performed<Id>
}

// レコードが対象のアクションが変えるレコードの、種類 subject と、前 now と後 next の組（宛先の 1 件と、ほかの others）。
// others の種類は、省けば宛先と同じ種類で、別の種類はアクションの writes に書いた種類だけ（書いていなければ null）。
// others の前は、読み口から引く（読み口の無い文脈なら、ctx.records のその種類から引き、それも無ければ others は断る）。
// 同じ（種類, id）を 2 度変える・合わせて RECORDS_MAX 件を超えるなら null
function recordChanges(
  ctx: ActionContext,
  action: ActionDef,
  subject: unknown,
  next: unknown,
  others: readonly OtherRecord<never>[],
): { subject: string; now: unknown; next: unknown }[] | null {
  if (others.length + 1 > RECORDS_MAX) return null
  const target = action.target
  const source = sourceIn(ctx)
  const own = next === REMOVED ? subject : next
  const seen = new Set<string>(
    own !== NO_RECORD && typeof own === "object" && own !== null
      ? [`${target}\n${String((own as { id?: unknown }).id)}`]
      : [],
  )
  const changes: { subject: string; now: unknown; next: unknown }[] = [{ subject: target, now: subject, next }]
  for (const o of others) {
    const kind: string = o.subject ?? target
    if (kind !== target && !(action.writes as readonly string[] | undefined)?.includes(kind)) return null
    const table = source ? undefined : ctx.records?.[kind]
    if (table === undefined && !source) return null
    const key = `${kind}\n${o.id}`
    if (seen.has(key)) return null
    seen.add(key)
    const now = (source ? source.byId(kind, o.id) : table?.[o.id]) ?? NO_RECORD
    // 作るレコードは、変更の id と record の id が同じ
    if (now === NO_RECORD && o.record !== REMOVED && (o.record as { id?: unknown } | null)?.id !== o.id) return null
    changes.push({ subject: kind, now, next: o.record })
  }
  return changes
}

// アクションが変えるもの全部: ページの表とフォルダの表（ゴミ箱のブックの分も。ブックは、ここから組む。core/folders.ts）と、利用者の設定と、ページごとのアノテーションと、対象の定義が足した種類のレコードと番号の表
export interface World extends Library {
  settings: Settings
  annotations: Annotations
  records: Records // 対象の定義が足した種類ごとのレコード（種類の id → id → レコード）
  counters: Counters // 番号を振る種類ごとの、区切りごとの次の番号
  // レコードの読み口（無ければ records から引く。ホストのエンジンは、records に宛先だけを持ち、ほかは置き場所から引く読み口を渡す）
  source?: RecordSource
}

// performIn の結果。変わったものだけを持つ（changes は変わった・足した・無くなったページとフォルダ。ブック・ページ・書庫が対象のアクションで、何も変わらなければ無い。
// annotations はアノテーションが変わったページの id → 新しい並び。アノテーションが対象のアクションのほか、ページの物が消えたときと、ページが無くなったときと、ブックが一覧から無くなったときにも変わる）
export type PerformedIn =
  | {
      ok: true
      result: unknown
      changes?: TableChanges
      settings?: Settings
      annotations?: Annotations
      records?: readonly RecordChange[] // レコードが対象のアクションで変わったレコード（宛先の 1 件が先で、ほかは run が返した順。1 つのトランザクションで当てる）
      counters?: Counters // レコードが対象のアクションが進めた番号（種類の id → 区切り → 次の番号。進めた区切りだけ）
      aiEditTickets?: readonly AIEditTicketChange[] // レコードが対象のアクションが返した、AI 編集チケットの変え方の並び（レコードと同じ 1 回の書き込みで当てる）
      aiMessages?: readonly AIMessage[] // レコードが対象のアクションが返した、送る AI 間メッセージの並び（常駐がバルクの書き込みと一緒に送る）
    }
  | Refused
  | { ok: false; reason: "no-book" }
  | { ok: false; reason: "no-record"; detail: string }

// ページかアノテーションが対象のアクションの宛先（on のページ）と、そのページを持っているブック（performIn と permittedIn で同じ決まりを使う）。
// ゴミ箱のブックのページと、どのブックにも入っていないページは、無いものとする
function pageIn(world: World, on: ActionOn | undefined): PageInBook | NoPage | Unreadable {
  const page = (on && "page" in on ? on.page : undefined) ?? ""
  const book = bookOf(world, bookIdOf(world.folders, page) ?? "")
  const row = world.pages[page]
  if (!book || inTrash(world.folders, book.id) || !row) return noPage(page)
  return row.kind === "unreadable" ? unreadable(row) : { book, page }
}

const unreadable = (entry: UnreadableEntry): Unreadable => ({
  ok: false,
  reason: "unreadable",
  page: entry.id,
  code: entry.code,
})

// on.record に指した id のレコードが無いときの断り: どの種類のどの id が無いか。AI に見える種類なら、直し方（一覧の引き方）と種類の説明（id が何の id か）も
function noRecord(
  catalog: CoreCatalog,
  target: string,
  wanted: string,
): { ok: false; reason: "no-record"; detail: string } {
  const def = catalog.subjects.get(target)
  // AI に見せる種類（aiBrief を書いた種類）だけ、一覧の引き方と種類の説明を言う
  const shown = def?.aiBrief !== undefined
  const list = shown ? `; read_records with kind ${target} lists the records` : ""
  const about = shown ? ` About that subject: ${def.aiDescription}` : ""
  return {
    ok: false,
    reason: "no-record",
    detail: `there is no ${target} record with the id ${wanted} (on.record is the id of a record of the action's subject${list}).${about}`,
  }
}

// 対象を world から選んでアクションを行う（画面の store・常駐・行い直しで同じ決まりを使う）。
// ブックが対象なら on のブックで（ゴミ箱のブックは無いものとして断る）、ページとアノテーションが対象なら on のページを持っているブックで行い、ブックの id を変えたら断る。同じ値の設定は変わらなかったとみなす。
// ブックが変わったら、無くなった物をそのページのアノテーションのアンカーから外し（core/annotation.ts の prune）、無くなったページと、一覧から無くなったブックのページのアノテーションは消す
export function performIn(
  world: World,
  id: string,
  args: unknown,
  on: ActionOn | undefined,
  ctx: ActionContext,
): PerformedIn {
  const target: ActionTarget | undefined = ctx.catalog.actions.get(id)?.target
  const loose = perform as (
    subject: unknown,
    id: string,
    args: unknown,
    ctx: ActionContext,
  ) => ReturnType<typeof perform>
  if (target !== undefined && isRecordTarget(ctx.catalog, target))
    return performRecord(world, target, id, args, on, ctx)
  if (target === "book") {
    const book = bookIn(world, on as { book: string } | undefined)
    if (!book) return { ok: false, reason: "no-book" }
    return changedBook(ctx.catalog, world, book, loose(book, id, args, ctx))
  }
  if (target === "annotations") {
    const at = pageIn(world, on)
    if ("ok" in at) return at
    const annotations = world.annotations[at.page] ?? []
    const done = loose({ ...at, annotations }, id, args, ctx)
    if (!done.ok) return done
    const next = (done.next as PageAnnotations).annotations
    return next === annotations
      ? { ok: true, result: done.result }
      : { ok: true, result: done.result, annotations: { [at.page]: next } }
  }
  if (target === "page") {
    const at = pageIn(world, on)
    if ("ok" in at) return at
    return changedBook(ctx.catalog, world, at.book, loose(at, id, args, ctx))
  }
  if (target === "library") {
    const library: Library = { pages: world.pages, folders: world.folders }
    const naming = namingOf(ctx.catalog, world.settings)
    const done = loose(library, id, args, { ...ctx, naming })
    if (!done.ok) return done
    const made = rowChanges(library, done.next as Library)
    // 足したブックと無くなったブックの置き場所を書く。木の決まりを守っていた世界は、行った後も守る
    const changes = placedChanges(world, made)
    const after = withChanges(world, changes)
    if (!treeHolds(after)) return { ok: false, reason: "refused" }
    if (titleClashes(world, after, naming).length > 0) return titleTaken
    // 無くなったページのアノテーションは消す
    const gone = Object.entries(changes.pages)
      .filter(([p, v]) => v === REMOVED && (world.annotations[p]?.length ?? 0) > 0)
      .map(([p]) => p)
    return {
      ok: true,
      result: done.result,
      ...(noChanges(changes) ? {} : { changes }),
      ...(gone.length === 0 ? {} : { annotations: Object.fromEntries(gone.map(p => [p, []])) }),
    }
  }
  const done = loose(world.settings, id, args, ctx)
  if (!done.ok) return done
  const next = done.next as Settings
  const same = sameData(next, world.settings)
  if (same) return { ok: true, result: done.result }
  // 言語が変わって、名前を設定の言語で引く物（システムフォルダ）の名前が、同じフォルダのほかの物と重なるなら断る（書庫の行は変えない）
  const library: Library = { pages: world.pages, folders: world.folders }
  const naming = namingOf(ctx.catalog, world.settings)
  const nextNaming = namingOf(ctx.catalog, next)
  if (nextNaming.lang !== naming.lang && titleClashes(library, library, naming, nextNaming).length > 0)
    return languageTitleTaken
  return { ok: true, result: done.result, settings: next }
}

// 同じフォルダ（ゴミ箱の直下を除く）の中で、名前が重なる断り
const titleTaken = {
  ok: false,
  reason: "refused",
  kind: TITLE_TAKEN,
  detail:
    "an entry with the same title is already in the same folder (titles do not repeat within a folder); use another title",
} as const

// 言語を変えると、その言語で引く名前（システムフォルダ）が、同じフォルダのほかの物と重なる断り
const languageTitleTaken = {
  ok: false,
  reason: "refused",
  kind: TITLE_TAKEN,
  detail:
    "in that language, the title of a system folder would be the same as that of another entry in the same folder; rename that entry first",
} as const

// 変わり changes が新しく足すページ・フォルダの id が、世界 world にもう在るか（行う前のブック before に無かった物を足すなら、その id は世界のどこにも無いこと。
// ページもフォルダも、ちょうど 1 つのフォルダに入り、id は世界の中で重ならない）
const collides = (world: Library, before: readonly Book[], changes: TableChanges): boolean =>
  createdIn(before, changes).some(id => id in world.pages || id in world.folders)

// ブックを変えるアクションの結果 done を、変わった物だけの形にする（book は行う前のブック）。
// ブックの id を変えていたら断り、変わったページでは無くなった物をアノテーションのアンカーから外し、無くなったページのアノテーションは消す
function changedBook(catalog: CoreCatalog, world: World, book: Book, done: ReturnType<typeof perform>): PerformedIn {
  if (!done.ok) return done
  const next = done.next as Book
  if (next.id !== book.id) return { ok: false, reason: "refused" }
  if (next === book) return { ok: true, result: done.result }
  const changes = changesBetween([book], [next])
  if (collides(world, [book], changes)) return { ok: false, reason: "refused" }
  if (
    next.title !== book.title &&
    titleClashes(world, withChanges(world, changes), namingOf(catalog, world.settings)).length > 0
  )
    return titleTaken
  const { annotations } = world
  const now = new Map(pagesOf(next).map(p => [p.id, p]))
  const changed: Record<string, readonly Annotation[]> = {}
  for (const was of pagesOf(book)) {
    const list = annotations[was.id]
    if (!list || list.length === 0) continue
    const page = now.get(was.id)
    const kept = !page ? [] : page === was ? list : prune(list, page)
    if (kept !== list) changed[was.id] = kept
  }
  return {
    ok: true,
    result: done.result,
    ...(noChanges(changes) ? {} : { changes }),
    ...(Object.keys(changed).length === 0 ? {} : { annotations: changed }),
  }
}

// アクションの対象が、対象の定義が足した種類か
const isRecordTarget = (catalog: CoreCatalog, target: string): boolean => catalog.subjects.has(target)

// レコードが対象のアクションの結果 next が形を守っているか: 新しいレコードは種類の形に合い、id は変わらず（作るときは新しい id）、消すなら now がある。
// 種類が形のほかの確かめ（対象の定義の check）を書いていれば、それにも通る（郵便なら、郵便の種類が機能台帳にあって、その形にも合う）
function recordSettles(catalog: CoreCatalog, target: string, now: unknown, next: unknown): boolean {
  if (next === REMOVED) return now !== NO_RECORD
  const def = catalog.subjects.get(target)
  const fits = def?.record.safeParse(next)
  if (!fits?.success) return false
  if (def?.check && def.check(next, catalog).length > 0) return false
  return now === NO_RECORD || (now as { id: string }).id === (next as { id: string }).id
}

// レコードが対象のアクションを行う: on の record のレコード（無ければ新しく作る）を渡し、宛先と、run が返したほかの同じ種類のレコードを変えた結果を返す。
// 作るレコードの id は今ある id と重ならない。readsBooks を書いたアクションには、引数が答えた id のブックだけを ctx.books に渡す
function performRecord(
  world: World,
  target: string,
  id: string,
  args: unknown,
  on: ActionOn | undefined,
  ctx: ActionContext,
): PerformedIn {
  const source = world.source ?? sourceOf(world.records)
  const def = ctx.catalog.subjects.get(target)
  const action = ctx.catalog.actions.get(id)
  const used: Record<string, number> = {}
  const counters = world.counters[target] ?? {}
  const wanted = on && "record" in on ? on.record : undefined
  const now = wanted === undefined ? NO_RECORD : source.byId(target, wanted)
  if (now === undefined) return noRecord(ctx.catalog, target, wanted as string)
  const referred = now === NO_RECORD ? [] : (def?.refers?.(now as never) ?? [])
  const read = action
    ? readFrom(ctx.catalog, source, action, args, ctx.actor, wanted, referred)
    : { records: {}, keys: {}, record: () => NO_RECORD }
  const withBase: ActionContext & WithSource = {
    ...ctx,
    [SOURCE]: source,
    records: read.records,
    keys: read.keys,
    record: read.record,
    ...(action?.readsBooks ? { books: booksRead(world, action, args) } : {}),
    ...(def?.numbered
      ? {
          number: (scope: string) => {
            const n = used[scope] ?? counters[scope] ?? 1
            used[scope] = n + 1
            return n
          },
        }
      : {}),
  }
  const done = (perform as (s: unknown, id: string, a: unknown, c: ActionContext) => ReturnType<typeof perform>)(
    now,
    id,
    args,
    withBase,
  )
  if (!done.ok) return done
  const next = done.next as unknown
  const changes: RecordChange[] = []
  if (next === REMOVED) changes.push({ subject: target, id: wanted as string, record: REMOVED })
  else if (next !== now) {
    const made = (next as { id: string }).id
    if (now === NO_RECORD && source.byId(target, made) !== undefined)
      return {
        ok: false,
        reason: "refused",
        detail: `the ${target} record ${made} is already there: change it with on.record set to ${made}; leaving on out makes a new record`,
      }
    changes.push({ subject: target, id: made, record: next })
  }
  for (const o of done.others ?? []) {
    const kind: string = o.subject ?? target
    const had = source.byId(kind, o.id)
    if (o.record === REMOVED ? had === undefined : o.record === had) continue
    changes.push({ subject: kind, id: o.id, record: o.record })
  }
  return {
    ok: true,
    result: done.result,
    ...(changes.length > 0 ? { records: changes } : {}),
    ...(changes.length > 0 && Object.keys(used).length > 0 ? { counters: { [target]: used } } : {}),
    ...(done.aiEditTickets ? { aiEditTickets: done.aiEditTickets } : {}),
    ...(done.aiMessages ? { aiMessages: done.aiMessages } : {}),
  }
}

// アクション action が引数 args から答えた、読むだけのブック（world にあるブックだけ。引数が形に合わなければ無し）
function booksRead(world: World, action: ActionDef, args: unknown): Books {
  const parsed = action.args.safeParse(args)
  if (!parsed.success || !action.readsBooks) return {}
  const ids = (action.readsBooks as (args: unknown) => readonly string[])(parsed.data)
  return Object.fromEntries(
    ids.flatMap(id => {
      const book = bookOf(world, id)
      return book ? [[id, book]] : []
    }),
  )
}

// ブックが対象のアクションの宛先のブック（on のブック。無いか、ゴミ箱のブックなら null）。performIn と permittedIn で同じ決まりを使う
function bookIn(world: World, on: ActionOn | undefined): Book | null {
  const book = bookOf(world, (on && "book" in on ? on.book : undefined) ?? "")
  return book && !inTrash(world.folders, book.id) ? book : null
}

// world でアクション id を引数 args で行えるかを、行う前に問う（対象の選び方は performIn と同じ。run は回さない）
export function permittedIn(
  world: World,
  id: string,
  args: unknown,
  on: ActionOn | undefined,
  ctx: PermitContext,
): Permitted | Refused | { ok: false; reason: "no-book" } | ReturnType<typeof noRecord> {
  const target: ActionTarget | undefined = ctx.catalog.actions.get(id)?.target
  if (target === "book") {
    const book = bookIn(world, on)
    return book ? permitted(book, id, args, ctx) : { ok: false, reason: "no-book" }
  }
  if (target === "page" || target === "annotations") {
    const at = pageIn(world, on)
    if ("ok" in at) return at
    return permitted(target === "page" ? at : { ...at, annotations: world.annotations[at.page] ?? [] }, id, args, ctx)
  }
  if (target !== undefined && isRecordTarget(ctx.catalog, target)) {
    const wanted = on && "record" in on ? on.record : undefined
    const source = world.source ?? sourceOf(world.records)
    const now = wanted === undefined ? NO_RECORD : source.byId(target, wanted)
    return now === undefined
      ? noRecord(ctx.catalog, target, wanted as string)
      : permitted(now, id, args, { ...ctx, [SOURCE]: source, records: {} })
  }
  return permitted(
    target === "library" ? { pages: world.pages, folders: world.folders } : world.settings,
    id,
    args,
    ctx,
  )
}
