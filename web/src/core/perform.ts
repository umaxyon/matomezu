// アクションを行う、データを変える入口。対象で使えるアクションかと引数の形を確かめてから run する。
// 使えるかは、book・page・annotations が対象ならアクションが名指すページのタイプ（名指さなければ、タイプに依らない付く先だけ）、library・settings と対象の定義の種類が対象ならインスタンスのコントロールセンターが決める（コントロールセンターが無ければ断る）。
// その前に認可ステップ（core/def/permission.ts）が止められ、run の結果も認可ステップが守らせることを守っていなければ断る（denied）

import type { z } from "zod"
import { workroomOfActor } from "./actor"
import { type Annotation, annotationsSettle, type PageAnnotations } from "./annotation"
import { findPage, keepsPageTypes, keepsPageTypesAcross, pageSettles, putPage } from "./book"
import type { ActionId, ActionTable } from "./catalog"
import { pageChangeOf } from "./changes"
import type {
  ActionContext,
  ActionDef,
  ActionTarget,
  AIEditTicketChange,
  AIMessage,
  Declined,
  Done,
  OtherRecord,
  SubjectData,
} from "./def/action"
import { clashedSystemFolder, type Naming, TITLE_TAKEN, titleClashes } from "./entries"
import { type Folder, homeOrFolderHolds, isOpenRole, type Library } from "./folders"
import { libraryOf } from "./folders-books"
import { idsIn, skipping } from "./ids"
import {
  broken,
  brokenPage,
  brokenRecord,
  isRecordTarget,
  librarySettles,
  normalized,
  normalizedPage,
  recordSettles,
  settles,
} from "./perform-checks"
import { brokenIn, normalizedLibrary, systemFoldersKept } from "./perform-library"
import { type Denied, NOT_IN_BOOK, permits } from "./perform-permit"
import type { ItemPage } from "./placed"
import { sourceIn } from "./record-source"
import { NO_RECORD, RECORDS_MAX, REMOVED } from "./records"
import type { Book } from "./schema/book"

type ActionOf<Id extends ActionId> = ActionTable[Id]
export type TargetOf<Id extends ActionId> = ActionOf<Id>["target"]
// ページが対象のアクションを行うときに渡す対象: ページを持っているブックと、そのページの id（run が受けるのは、そのページだけ）
export interface PageInBook {
  book: Book
  page: string
}

// ブックの外のページに、ページが対象のアクションを行うときに渡す対象: そのページの id と値 held と、認可ステップに見せるフォルダの列 folders
// （core/folders-tree.ts の permissionFoldersOf。入れているバインダだけか空）
export interface PageOutsideBook {
  book: typeof NOT_IN_BOOK
  page: string
  held: ItemPage
  folders: readonly Folder[]
}
export type PageAt = PageInBook | PageOutsideBook
// ページのアノテーションが対象のアクションを行うときに渡す対象: 宛先のページ（ブックの中か外）と、そのページのアノテーションの並び
// （run が受けるのは、そのページと並び）
export type AnnotationsAt = PageAt & { annotations: readonly Annotation[] }
export type SubjectOf<Id extends ActionId> =
  TargetOf<Id> extends "page" ? PageAt : TargetOf<Id> extends "annotations" ? AnnotationsAt : SubjectData<TargetOf<Id>>
// 行った後の対象（ページが対象のアクションは、ページを替えたブックか、渡した対象 S がブックの外のページなら、そのページ）
export type NextOf<Id extends ActionId, S = SubjectOf<Id>> =
  TargetOf<Id> extends "page" ? (S extends PageOutsideBook ? ItemPage : Book) : SubjectData<TargetOf<Id>>
export type ArgsOf<Id extends ActionId> = z.input<ActionOf<Id>["args"]>
export type ResultOf<Id extends ActionId> =
  ActionOf<Id> extends ActionDef<infer _T, infer _A, infer R, infer _I> ? R : never

// denied は認可ステップが止めたこと（permission はそのステップの id）。refused の detail・kind は、run が添えた断った理由の文と断りの種類（def/action.ts の Declined）。not-allowed で止めたのが利用者の設定の項目ごとのステップなら、
// setting にその項目の id、because に理由（user-only は利用者だけが変える項目、fixed はコントロールセンターが変えさせない項目。参加のステップなら not-joined は参加が確定していない AI、visitor はビジター）
export type Refusal = "unknown" | "not-allowed" | "bad-args" | "refused"
export type NotAllowed = {
  ok: false
  reason: "not-allowed"
  setting?: string
  because?: "user-only" | "fixed" | "not-joined" | "visitor"
}
// 宛先のページが無い（ブックのどこにも無い・ゴミ箱のブックにある・2 冊にある）。detail は AI への説明に載る英語の文
export type NoPage = { ok: false; reason: "no-page"; detail: string }
export type Refused =
  | { ok: false; reason: Exclude<Refusal, "not-allowed" | "refused"> }
  | NoPage
  // kind は断りの種類（run が添えた名前か、土台の種類。土台の種類は名前空間が付かない）。systemFolder は、名前が重なる断り（title-taken）で、重なった相手がシステムフォルダのときの、その印（定義の id）
  | { ok: false; reason: "refused"; detail?: string; kind?: string; systemFolder?: string }
  | NotAllowed
  | Denied
// others はレコードが対象のアクションが、宛先のほかに変えたレコード（同じ種類か、writes に書いた種類。確かめ終えた物）
export type Performed<Id extends ActionId, S = SubjectOf<Id>> =
  | {
      ok: true
      next: NextOf<Id, S>
      result: ResultOf<Id>
      others?: readonly OtherRecord<never>[]
      aiEditTickets?: readonly AIEditTicketChange[]
      aiMessages?: readonly AIMessage[]
    }
  | Refused

// 宛先のページが無いときの断り（直し方も言う）
export const noPage = (wanted: string): NoPage => ({
  ok: false,
  reason: "no-page",
  detail: `there is no page with the id ${wanted} (on.page is the id of a page; read_book lists a book's pages)`,
})

// 書庫 library の、ページとフォルダの行の id
const rowIdsIn = (library: Library): string[] => [...Object.keys(library.pages), ...Object.keys(library.folders)]

// アクション action の run だけを行う（使えるか・整え・認可ステップ・形の確かめはしない。それは perform がする）。args は引数の形を通した後の値。
// ページが対象なら、対象 subject（PageAt）のブックからページを探して run に渡し、返ったページを同じ所へ戻したブックを next にする（ブックの外のページなら、返ったページを next にする）
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
  const at = subject as PageAt
  const page = at.book === NOT_IN_BOOK ? at.held : findPage(at.book, at.page)?.page
  if (!page) return null
  if (action.target === "annotations") {
    const ran = run({ page, annotations: (subject as AnnotationsAt).annotations }, args, ctx)
    return ran && !("declined" in ran) && (ran.next as PageAnnotations).page !== page ? null : ran
  }
  const ran = run(page, args, { ...ctx, newId: skipping(ctx.newId, () => idsIn(page)) })
  if (!ran || "declined" in ran) return ran
  const next = ran.next as ItemPage
  if (next.id !== page.id) return null
  if (at.book === NOT_IN_BOOK) return ran
  return { ...ran, next: next === page ? at.book : putPage(at.book, next) }
}

export function perform<Id extends ActionId, S extends SubjectOf<Id> = SubjectOf<Id>>(
  subject: S,
  id: Id,
  args: ArgsOf<Id>,
  ctx: ActionContext,
): Performed<Id, S> {
  const action: ActionDef | undefined = ctx.catalog.actions.get(id)
  if (!action) return { ok: false, reason: "unknown" }
  if (action.target === "page" || action.target === "annotations") {
    const at = subject as PageAt
    if (at.book === NOT_IN_BOOK) return performOutside(action, at, args, ctx) as Performed<Id, S>
    if (!findPage(at.book, at.page)) return noPage(at.page)
  }
  // ブックを変えるアクション（ブックが対象か、ページが対象）の、行う前のブック
  const before =
    action.target === "book" ? (subject as Book) : action.target === "page" ? (subject as PageInBook).book : undefined
  const parsed = action.args.safeParse(args)
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
      ? normalizedLibrary(ctx.catalog, action, subject as Library, ran.next as Library)
      : ran.next
  if (!next) return { ok: false, reason: "refused" }
  const done = { ...ran, next }
  const nowBooks = wasBooks ? libraryOf(next as Library) : undefined
  // アノテーションのアクションはページを変えない（変えたら runAction が断る）。認可ステップの keeps は、変わらないブックで見る
  const pair = subject as unknown as AnnotationsAt & PageInBook
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
    // 行う前から在るページのタイプも、変えない（ページがブックの間を動いても）
    const typesKept = keepsPageTypesAcross(Object.values(was), Object.values(now))
    // 同じ入れ物の中の名前の重なりは、ブックの決まりで断る前に、名前が重なる断りにする
    const clashes = titleClashes(next as Library, ctx.naming)
    if (clashes.length > 0) return titleTaken(next as Library, clashes, ctx.naming)
    if (!librarySettles(ctx.catalog, was, now) || !typesKept) return { ok: false, reason: "refused" }
  }
  if (action.target === "annotations") {
    const { page, annotations: next } = done.next as unknown as PageAnnotations
    if (!annotationsSettle(ctx.catalog, page, pair.annotations, next)) return { ok: false, reason: "refused" }
  }
  const others = (ran.others ?? []) as readonly OtherRecord<never>[]
  // 送る AI 間メッセージは、レコードが対象のアクションで、行う者がワークルームに入っている AI のときだけ（送り手は行った参加者）
  const messages = isRecordTarget(ctx.catalog, action.target) ? (ran.aiMessages ?? []) : []
  if (messages.length > 0 && workroomOfActor(ctx.actor) === undefined)
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
  } as Performed<Id, S>
}

// ブックの外のページ at に、ページかアノテーションが対象のアクション action を引数 args で行う（perform の、宛先がブックの外のページのときの道）。
// 使えるかと認可ステップは、そのページそのもので問い、run が返したページをノーマライズステップで整え、認可ステップの守らせること（kind "page"）と、
// ページの形と決まりとタイプを確かめる（アノテーションが対象なら、変わらないページで確かめ、アノテーションの決まりを見る）
function performOutside(
  action: ActionDef,
  at: PageOutsideBook | (AnnotationsAt & PageOutsideBook),
  args: unknown,
  ctx: ActionContext,
): Performed<ActionId> {
  const parsed = action.args.safeParse(args)
  const permitted = permits(ctx, action, at, parsed)
  if (!permitted.ok) return permitted
  if (!parsed.success) return { ok: false, reason: "bad-args" }
  const ran = runAction(action, at, parsed.data, ctx)
  if (!ran) return { ok: false, reason: "refused" }
  if ("declined" in ran)
    return { ok: false, reason: "refused", detail: ran.declined, ...(ran.kind === undefined ? {} : { kind: ran.kind }) }
  if ((ran.others ?? []).length > 0) return { ok: false, reason: "refused" }
  const { held, folders } = at
  const broke = (after: ItemPage) =>
    brokenPage(ctx, action, {
      before: held,
      after,
      folders: { before: folders, after: folders },
      change: pageChangeOf(held.id, held, after),
      place: "same",
    })
  if (action.target === "annotations") {
    const permission = broke(held)
    if (permission) return { ok: false, reason: "denied", permission }
    const { page, annotations } = ran.next as PageAnnotations
    if (!annotationsSettle(ctx.catalog, page, (at as AnnotationsAt).annotations, annotations))
      return { ok: false, reason: "refused" }
    return { ok: true, next: ran.next as never, result: ran.result as never }
  }
  const next = normalizedPage(ctx.catalog, action, held, ran.next as ItemPage)
  if (!next) return { ok: false, reason: "refused" }
  const permission = broke(next)
  if (permission) return { ok: false, reason: "denied", permission }
  // ページのタイプは作ったあと変えない
  if (next.type !== held.type || !pageSettles(ctx.catalog, next)) return { ok: false, reason: "refused" }
  return { ok: true, next, result: ran.result as never }
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

// 名前が重なる断り（説明 detail）。書庫 library のフォルダ clashes（titleClashes）で重なった相手がシステムフォルダなら、その印を添える（名前は naming で引く）
function titleTakenOf(detail: string, library: Library, clashes: readonly string[], naming: Naming): Refused {
  const systemFolder = clashedSystemFolder(library, clashes, naming)
  return { ok: false, reason: "refused", kind: TITLE_TAKEN, detail, ...(systemFolder ? { systemFolder } : {}) }
}

// 同じフォルダ（ゴミ箱の直下を除く）の中で、名前が重なる断り
export const titleTaken = (library: Library, clashes: readonly string[], naming: Naming): Refused =>
  titleTakenOf(
    "an entry with the same title is already in the same folder (titles do not repeat within a folder); use another title",
    library,
    clashes,
    naming,
  )

// 言語を変えると、その言語で引く名前（システムフォルダ）が、同じフォルダのほかの物と重なる断り
export const languageTitleTaken = (library: Library, clashes: readonly string[], naming: Naming): Refused =>
  titleTakenOf(
    "in that language, the title of a system folder would be the same as that of another entry in the same folder; rename that entry first",
    library,
    clashes,
    naming,
  )
