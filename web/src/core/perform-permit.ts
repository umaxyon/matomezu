// アクションを行う前に、使えるかと認可ステップが止めるかを問う（perform の行う前の確かめと同じ答え。run は回さない）

import { USER } from "./actor"
import { findPage, pagesOf } from "./book"
import type { CoreCatalog } from "./core-catalog"
import {
  type ActionContext,
  type ActionDef,
  type AnyLibraryScope,
  type AnyPagePermissionScope,
  type AnyPermissionScope,
  type AnySettingsScope,
  libraryScopeOf,
  pageScopeOf,
  pagesScopeOf,
  type Subjects,
  scopeOf,
  settingsScopeOf,
  takesBook,
  type Where,
} from "./def/action"
import type { Referred } from "./def/permission"
import type { Library } from "./folders"
import { outsideBinderIn, permissionFoldersOf } from "./folders-tree"
import {
  type AskedOutermost,
  type AskedPage,
  type AskedPlace,
  actionQuery,
  decide,
  decidedByPlace,
  deniedBy,
  type Inspected,
  inspect,
  type Query,
  withoutPermissions,
} from "./inspect"
import type { BinderOutsideBook, NotAllowed, PageAt, Refused } from "./perform"
import { isRecordTarget } from "./perform-checks"
import { binderAsksOf, libraryAsksOf, NEW_BOOK } from "./perform-library"
import { sourceIn, type WithSource } from "./record-source"
import { referredOf } from "./refs"
import type { Book } from "./schema/book"

// 宛先のページが、どのブックにも入っていない印
export const NOT_IN_BOOK = "none"

// 行う前の問いに要る文脈（機能台帳・コントロールセンター・誰が行うか）
// records はレコードが対象のアクションが読む種類のレコード（reads。レコードが指すほかのレコードを引くのに使う）
export type PermitContext = Pick<ActionContext, "catalog" | "controlCenter" | "actor" | "records"> & WithSource

// 使えるかは inspect と同じ決まりで決める（問い合わせの答えと、実際に行えるかを食い違わせない）。利用者の設定が対象なら、許可スコープで引数から出した変える項目の id も渡す。
// 認可ステップに渡すのは、ブックが対象ならそのブックと、アクションの許可スコープ（permissionScope）で引数から出す所（無ければ分からないとして渡す）。
// 書庫が対象なら、許可スコープで引数から出した変えるブックごとに、そのブックとその中の所（作るブックは、空のブック）を渡し、どれかで止められれば止める。
// 書庫の許可スコープが "unknown" なら、認可ステップは行った後の keeps だけで見る
export function permits(
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
    page?: AskedPage,
    place?: AskedPlace,
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
        ...(page ? { page } : {}),
        ...(place ? { place } : {}),
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
    const found = targets ? libraryAsksOf(ctx.catalog, subject as Library, targets) : []
    if (found.length === 0) return asked(undefined, undefined)
    for (const a of found) {
      if ("place" in a) {
        // 置き場所で止めたときは、どのブック・ページで止めたかを添えない（止めたのは入れる先）
        const answer = answerOf(asking(undefined, undefined, undefined, undefined, a.place))
        if (!answer.ok) return answer
        continue
      }
      if ("page" in a) {
        const answer = answerOf(asking(undefined, undefined, undefined, a.page))
        const id = a.page.page.id
        if (!answer.ok)
          return answer.reason === "denied" && Object.hasOwn((subject as Library).pages, id)
            ? { ...answer, page: id }
            : answer
        continue
      }
      const answer = asked(a.book, a.where)
      if (!answer.ok) return answer.reason === "denied" && a.book !== NEW_BOOK ? { ...answer, book: a.book.id } : answer
    }
    return { ok: true }
  }
  if (action.target === "book" && (subject as BinderOutsideBook).book === NOT_IN_BOOK) {
    // ブックの外のバインダは、アクションが変える所を、中のページそのものに直して問う（どれかで止められれば止める。何にも問わない所なら、行う者だけで決まる）
    const { library, binder: id } = subject as BinderOutsideBook
    const binder = outsideBinderIn(library, id)
    if (!binder) return { ok: false, reason: "not-allowed" }
    const folders = permissionFoldersOf(library.folders, binder.lineup[0]?.id ?? id)
    const scope = action.permissionScope as AnyPermissionScope | undefined
    const ask = (page?: AskedPage) => asking(undefined, undefined, undefined, page)
    const answered = (where: Where | undefined) =>
      binderAsksOf(ctx.catalog, binder, folders, where).map(page => ({ page, answer: ask(page) }))
    // ページ 1 枚ごとに問う形は、ブックと同じく、止められなかったページを残す
    const named = args.success ? pagesScopeOf(scope, args.data) : null
    const each = named === "all" ? answered({ allPages: true }) : (named ?? []).flatMap(id => answered({ page: id }))
    const [first] = each
    if (first) {
      const pages = each.filter(a => a.answer.value === true).map(a => a.page.page.id)
      return pages.length > 0 ? { ok: true, pages } : answerOf(first.answer)
    }
    const decided = binderAnswer(action, binderAsksOf(ctx.catalog, binder, folders, placeOf(action, args)), ask)
    const answer = answerOf(decided.answer)
    const page = decided.page?.page.id
    return !answer.ok && answer.reason === "denied" && page !== undefined && Object.hasOwn(library.pages, page)
      ? { ...answer, page }
      : answer
  }
  const at = action.target === "page" || action.target === "annotations" ? (subject as PageAt) : undefined
  const book = action.target === "book" ? (subject as Book) : at && at.book !== NOT_IN_BOOK ? at.book : undefined
  // ブックの外のページは、そのページそのもので問う
  const outside = at?.book === NOT_IN_BOOK ? at : undefined
  if (action.target === "page") {
    // 所は、宛先のページと、引数が名指す中の物（引数が形に合わなければ、ページだけ）
    const scope = args.success ? (action.permissionScope as AnyPagePermissionScope | undefined) : undefined
    const where = pageScopeOf(scope, (subject as PageAt).page, args.success ? args.data : undefined)
    const answer = outside
      ? asking(undefined, undefined, undefined, {
          page: outside.held,
          folders: outside.folders,
          ...(where.ids ? { where: { ids: where.ids } } : {}),
        })
      : asking(book, where)
    return !args.success && answer.value === false && decidedByPlace(answer) ? { ok: true } : answerOf(answer)
  }
  // アノテーションが対象なら、所は宛先のページ
  if (action.target === "annotations")
    return outside
      ? answerOf(asking(undefined, undefined, undefined, { page: outside.held, folders: outside.folders }))
      : asked(book, { page: (subject as PageAt).page })
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

// ステージで開いている物 on の所 where で、アクション action を使えるかの問いの答え（画面のコマンドと見た目が、出すか・押せるかを決める。extra は問いに足す物〈変える利用者の設定の項目など〉）。
// ブックの外のバインダを開いていて、ブックが対象のアクションなら、perform の行う前の問い（permits）と同じ相手（バインダの中のページそのもの）に問い、どれかが使えないなら、その答え。
// 所がどのページも決めなければ、行う者だけで決める。ブックにだけ行えるアクションは使えない。ほかは core/inspect.ts の actionQuery の問い
export function openedAnswer(
  catalog: CoreCatalog,
  action: string,
  on: AskedOutermost | undefined,
  where: Where | undefined,
  ctx: Pick<ActionContext, "controlCenter">,
  extra: Partial<Query> = {},
): Inspected<boolean> {
  const def = catalog.actions.get(action)
  const base = { ...actionQuery(catalog, action, on, where), ...extra } as Query
  if (!def || def.target !== "book" || !on || !("binder" in on)) return inspect(catalog, base, ctx)
  if (takesBook(def)) return { value: false, decidedBy: null, steps: [] }
  const ask = (page?: AskedPage) => inspect(catalog, (page ? { ...base, page } : base) as Query, ctx)
  return binderAnswer(def, binderAsksOf(catalog, on.binder, on.folders, where), ask).answer
}

// ブックが対象のアクション action を、ブックの外のバインダの中のページ asks（binderAsksOf の問う相手）に ask で問うた答え: どれかが使えないなら、その答えとそのページ。どれも使えれば、最初のページの答え。
// 何にも問わない所（引数が形に合わない・名指した物がバインダに無い・所がページを決めない）は、行う者だけで決め（ページ無しの ask）、止められなければ使える（ほかは、行う側の bad-args か run が断る）
function binderAnswer(
  action: ActionDef,
  asks: readonly AskedPage[],
  ask: (page?: AskedPage) => Inspected<boolean>,
): { answer: Inspected<boolean>; page?: AskedPage } {
  const [first] = asks
  if (!first)
    return {
      answer: decide([...ask().steps, { from: { source: "action", id: action.id, field: "run" }, value: true }]),
    }
  const answers = asks.map(page => ({ page, answer: ask(page) }))
  return answers.find(a => a.answer.value !== true) ?? (answers[0] as { page: AskedPage; answer: Inspected<boolean> })
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

// 行う前の問いの答え: 使えるか、止めた理由
export type Permitted = { ok: true } | NotAllowed | Denied

// 認可ステップ permission が止めた断り。書庫が対象のアクションでは、どのブックで止めたかを book に、どのブックの外のページ（ブックとの間を出入りしたページも）で止めたかを page に持つ
// （作るブック・作るページで止めたなら無い）
export type Denied = { ok: false; reason: "denied"; permission: string; book?: string; page?: string }

function answerOf(answer: Inspected<boolean>): Permitted {
  if (answer.value === true) return { ok: true }
  const permission = deniedBy(answer)
  if (permission) return { ok: false, reason: "denied", permission }
  const from = answer.decidedBy
  if (from?.source === "participation") return { ok: false, reason: "not-allowed", because: from.because }
  if (from?.source === "userSetting")
    return { ok: false, reason: "not-allowed", setting: from.id, because: "user-only" }
  if (from?.source === "controlCenter" && from.id !== null && from.field === "fixedUserSettings")
    return { ok: false, reason: "not-allowed", setting: from.setting, because: "fixed" }
  return { ok: false, reason: "not-allowed" }
}

// 対象 subject に、アクション id を引数 args で行えるかを、行う前に問う（perform の行う前の確かめと同じ答え。run は回さない）
export function permitted(subject: unknown, id: string, args: unknown, ctx: PermitContext): Permitted | Refused {
  const action: ActionDef | undefined = ctx.catalog.actions.get(id)
  if (!action) return { ok: false, reason: "unknown" }
  const parsed = action.args.safeParse(args)
  const answer = permits(ctx, action, subject as Subjects[keyof Subjects], parsed)
  return answer.ok ? { ok: true } : answer
}
