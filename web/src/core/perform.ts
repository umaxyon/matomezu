// アクションを行う、データを変える入口。対象で使えるアクションかと引数の形を確かめてから run する。
// 使えるかは、book と annotations が対象ならアクションが名指すページのタイプ（名指さなければ、タイプに依らない付く先だけ）、library・settings と対象の定義の種類が対象ならインスタンスのコントロールセンターが決める（コントロールセンターが無ければ断る）。
// その前に認可ステップ（core/def/permission.ts）が止められ、run の結果も認可ステップが守らせることを守っていなければ断る（denied）

import type { z } from "zod"
import { USER } from "./actor"
import { type Annotations, annotationsSettle, type BookAnnotations, prune } from "./annotation"
import { holds, keepsPageTypes } from "./book"
import type { ActionId, ActionTable } from "./catalog"
import { changesOf } from "./changes"
import { type CoreCatalog, pageType } from "./core-catalog"
import {
  type ActionContext,
  type ActionDef,
  type ActionOn,
  type ActionTarget,
  type AIEditTicketChange,
  type AnyLibraryScope,
  type AnyPermissionScope,
  type AnySettingsScope,
  libraryScopeOf,
  type OtherRecord,
  type SubjectData,
  type Subjects,
  scopeOf,
  settingsScopeOf,
  type Where,
} from "./def/action"
import type { Referred } from "./def/permission"
import type { SubjectDef } from "./def/subject"
import { deniedBy, type Inspected, inspect, typeAllows, withoutPermissions } from "./inspect"
import type { Library } from "./library"
import { type RecordSource, readFrom, SOURCE, sourceIn, sourceOf, type WithSource } from "./record-source"
import { type Counters, NO_RECORD, RECORDS_MAX, REMOVED, type RecordChange, type Records } from "./records"
import { referredOf } from "./refs"
import { sameData } from "./same"
import type { Book, Page } from "./schema/book"
import type { Settings } from "./settings"
import { settledAfter } from "./settle"

type ActionOf<Id extends ActionId> = ActionTable[Id]
export type TargetOf<Id extends ActionId> = ActionOf<Id>["target"]
export type SubjectOf<Id extends ActionId> = SubjectData<ActionOf<Id>["target"]>
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
export type Refused =
  | { ok: false; reason: Exclude<Refusal, "not-allowed" | "refused"> }
  | { ok: false; reason: "refused"; detail?: string; kind?: string }
  | NotAllowed
  | { ok: false; reason: "denied"; permission: string }
// others はレコードが対象のアクションが、宛先のほかに変えたレコード（同じ種類か、writes に書いた種類。確かめ終えた物）
export type Performed<Id extends ActionId> =
  | {
      ok: true
      next: SubjectOf<Id>
      result: ResultOf<Id>
      others?: readonly OtherRecord<never>[]
      aiEditTickets?: readonly AIEditTicketChange[]
    }
  | Refused

// タイプ type のページで使えるアクション（表の並び）: タイプが選んだ物に付くアクションとタイプが足すアクションから、タイプが外すアクションを除く（inspect と同じ決まり）
export function actionsOfPage(catalog: CoreCatalog, page: Pick<Page, "type">): readonly string[] {
  const t = pageType(catalog, page.type)
  return [...catalog.actions.values()].filter(a => typeAllows(a, t)).map(a => a.id)
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

// 一覧が対象のアクションの結果で、変わったブックが（置いた鍵がブックの id で）形に合っているか
export function librarySettles(catalog: CoreCatalog, before: Library, after: Library): boolean {
  return (
    Object.entries(after).every(([key, b]) => b.id === key) &&
    settledAfter(Object.values(before), Object.values(after), b => settles(catalog, b))
  )
}

// アクションの結果が、認可ステップの守らせること（keeps）を守っているか。守っていなければ、守らせたステップの id
function broken(
  ctx: ActionContext,
  action: ActionDef,
  before: Book | undefined,
  after: Book | undefined,
): string | null {
  const changes = changesOf(before, after)
  for (const p of ctx.catalog.permissions.values())
    if (p.keeps && !p.keeps({ kind: "book", action, before, after, changes, actor: ctx.actor })) return p.id
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

// 一覧が対象のアクションの結果で、変わったブック・無くなったブック・増えたブックのどれかが守っていなければ、守らせたステップの id
function brokenIn(ctx: ActionContext, action: ActionDef, before: Library, after: Library): string | null {
  for (const b of Object.values(before)) {
    const id = b === after[b.id] ? null : broken(ctx, action, b, after[b.id])
    if (id) return id
  }
  for (const b of Object.values(after)) {
    const id = b.id in before ? null : broken(ctx, action, undefined, b)
    if (id) return id
  }
  return null
}

// 行う前の問いに要る文脈（機能台帳・コントロールセンター・誰が行うか）
// records はレコードが対象のアクションが読む種類のレコード（reads。レコードが指すほかのレコードを引くのに使う）
export type PermitContext = Pick<ActionContext, "catalog" | "controlCenter" | "actor" | "records"> & WithSource

// 使えるかは inspect と同じ決まりで決める（問い合わせの答えと、実際に行えるかを食い違わせない）。利用者の設定が対象なら、許可スコープで引数から出した変える項目の id も渡す。
// 認可ステップに渡すのは、ブックが対象ならそのブックと、アクションの許可スコープ（permissionScope）で引数から出す所（無ければ分からないとして渡す）。
// 一覧が対象なら、許可スコープで引数から出した変えるブックごとに、そのブックとその中の所（作るブックは、そのタイプで作る空のブック）を渡し、どれかで止められれば止める。
// 一覧の許可スコープが "unknown" なら、認可ステップは行った後の keeps だけで見る
function permits(
  ctx: PermitContext,
  action: ActionDef,
  subject: unknown,
  args: { success: true; data: unknown } | { success: false },
  raw: unknown,
): Permitted {
  const settings =
    args.success && action.target === "settings"
      ? settingsScopeOf(action.permissionScope as AnySettingsScope, args.data)
      : undefined
  const asked = (
    book: Book | undefined,
    where: Where | undefined,
    record?: { record: unknown; refs: readonly Referred[] },
  ) =>
    answerOf(
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
      ),
    )
  if (isRecordTarget(ctx.catalog, action.target)) {
    const refs = referredOf(ctx.catalog, action.target, subject, ctx.records ?? {}, sourceIn(ctx))
    if (refs === "unreadable") return { ok: false, reason: "not-allowed" }
    return asked(undefined, undefined, { record: subject, refs })
  }
  if (action.target === "library") {
    const targets = args.success ? libraryScopeOf(action.permissionScope as AnyLibraryScope, args.data) : null
    const library = subject as Library
    const books = (targets?.books ?? []).flatMap(t => {
      const book = library[t.book]
      return book ? [{ book, where: t.where }] : []
    })
    const made = targets?.creates ? [{ book: NEW_BOOK, where: {} }] : []
    const asks = [...books, ...made]
    if (asks.length === 0) return asked(undefined, undefined)
    for (const a of asks) {
      const answer = asked(a.book, a.where)
      if (!answer.ok) return answer
    }
    return { ok: true }
  }
  const book =
    action.target === "book"
      ? (subject as Book)
      : action.target === "annotations"
        ? (subject as BookAnnotations).book
        : undefined
  // 所は引数から出す。引数が形に合わなくても、名指したページは読めるだけ読む（ページのタイプで決まるアクションを、引数の誤りでブック全体として問わないように。誤りは bad-args で断る）
  // （読むのは、引数の名前で書いた許可スコープだけ。関数の許可スコープは、形の合った引数にだけ呼ぶ）
  const scope = action.permissionScope as AnyPermissionScope | undefined
  const named = typeof raw === "object" && raw !== null ? raw : {}
  const where =
    action.target !== "book"
      ? undefined
      : args.success
        ? scopeOf(scope, args.data)
        : typeof scope === "object"
          ? scopeOf(scope, named)
          : undefined
  return asked(book, where)
}

// ブック book に、ブックが対象のアクション id を引数 args で行えるか、認可ステップを除いて問う（引数が名指すページのタイプと、アクションの付く先だけで決まる）。
// 引数が形に合わなければ、所を名指さないブック全体として問う
export function allowedOnBook(catalog: CoreCatalog, book: Book, id: string, args: unknown): boolean {
  const action: ActionDef | undefined = catalog.actions.get(id)
  if (!action || action.target !== "book") return false
  const parsed = action.args.safeParse(args)
  const where = parsed.success ? scopeOf(action.permissionScope as AnyPermissionScope, parsed.data) : undefined
  const answer = inspect(catalog, { kind: "action", action: id, book, ...(where ? { where } : {}), actor: USER })
  return withoutPermissions(answer).value === true
}

// 作るブックを認可ステップに問うときの、空のブック（問うためだけの物）
const NEW_BOOK: Book = { id: "new-book", title: "new book", lineup: [] }

// 行う前の問いの答え: 使えるか、止めた理由
export type Permitted = { ok: true } | NotAllowed | { ok: false; reason: "denied"; permission: string }

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
export function permitted(subject: unknown, id: string, args: unknown, ctx: PermitContext): Permitted | Refused {
  const action: ActionDef | undefined = ctx.catalog.actions.get(id)
  if (!action) return { ok: false, reason: "unknown" }
  return permits(ctx, action, subject as Subjects[keyof Subjects], action.args.safeParse(args), args)
}

export function perform<Id extends ActionId>(
  subject: SubjectOf<Id>,
  id: Id,
  args: ArgsOf<Id>,
  ctx: ActionContext,
): Performed<Id> {
  const action: ActionDef | undefined = ctx.catalog.actions.get(id)
  if (!action) return { ok: false, reason: "unknown" }
  const parsed = action.args.safeParse(args)
  const permitted = permits(ctx, action, subject, parsed, args)
  if (!permitted.ok) return permitted
  if (!parsed.success) return { ok: false, reason: "bad-args" }
  const ran = action.run(subject as never, parsed.data, ctx)
  if (!ran) return { ok: false, reason: "refused" }
  if ("declined" in ran)
    return { ok: false, reason: "refused", detail: ran.declined, ...(ran.kind === undefined ? {} : { kind: ran.kind }) }
  const next = action.target === "book" ? normalized(ctx.catalog, action, subject as Book, ran.next as Book) : ran.next
  if (!next) return { ok: false, reason: "refused" }
  const done = { ...ran, next }
  // アノテーションのアクションはブックを変えない（変えたら断る）。認可ステップの keeps は、変わらないブックで見る
  const pair = subject as unknown as BookAnnotations
  if (action.target === "annotations" && (done.next as unknown as BookAnnotations).book !== pair.book)
    return { ok: false, reason: "refused" }
  const permission =
    action.target === "book"
      ? broken(ctx, action, subject as Book, done.next as Book)
      : action.target === "library"
        ? brokenIn(ctx, action, subject as Library, done.next as Library)
        : action.target === "annotations"
          ? broken(ctx, action, pair.book, pair.book)
          : null
  if (permission) return { ok: false, reason: "denied", permission }
  if (action.target === "book") {
    // ページのタイプは作ったあと変えない（アクションが替えていたら断る）
    if (!settles(ctx.catalog, done.next as Book) || !keepsPageTypes(subject as Book, done.next as Book))
      return { ok: false, reason: "refused" }
  }
  if (action.target === "library" && !librarySettles(ctx.catalog, subject as Library, done.next as Library))
    return { ok: false, reason: "refused" }
  if (action.target === "annotations") {
    const next = (done.next as unknown as BookAnnotations).annotations
    if (!annotationsSettle(ctx.catalog, pair.book, pair.annotations, next)) return { ok: false, reason: "refused" }
  }
  const others = (ran.others ?? []) as readonly OtherRecord<never>[]
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

// アクションが変えるもの全部: ブックの一覧（ゴミ箱のブックも）と、利用者の設定と、ブックごとのアノテーションと、対象の定義が足した種類のレコードと番号の表
export interface World {
  books: Library
  settings: Settings
  annotations: Annotations
  records: Records // 対象の定義が足した種類ごとのレコード（種類の id → id → レコード）
  counters: Counters // 番号を振る種類ごとの、区切りごとの次の番号
  // レコードの読み口（無ければ records から引く。ホストのエンジンは、records に宛先だけを持ち、ほかは置き場所から引く読み口を渡す）
  source?: RecordSource
}

// performIn の結果。変わったものだけを持つ（book はブックが対象のアクションで変わったブック、books は一覧が対象のアクションの新しい一覧、
// annotations はアノテーションが変わったブックの id → 新しい並び。アノテーションが対象のアクションのほか、ブックの物が消えたときと、ブックが一覧から無くなったときにも変わる）
export type PerformedIn =
  | {
      ok: true
      result: unknown
      book?: Book
      books?: Library
      settings?: Settings
      annotations?: Annotations
      records?: readonly RecordChange[] // レコードが対象のアクションで変わったレコード（宛先の 1 件が先で、ほかは run が返した順。1 つのトランザクションで当てる）
      counters?: Counters // レコードが対象のアクションが進めた番号（種類の id → 区切り → 次の番号。進めた区切りだけ）
      aiEditTickets?: readonly AIEditTicketChange[] // レコードが対象のアクションが返した、AI 編集チケットの変え方の並び（レコードと同じ 1 回の書き込みで当てる）
    }
  | Refused
  | { ok: false; reason: "no-book" }
  | { ok: false; reason: "no-record"; detail: string }

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
// ブックとアノテーションが対象なら on のブックで（ゴミ箱のブックは無いものとして断る）、ブックの id を変えたら断る。同じ値の設定は変わらなかったとみなす。
// ブックが変わったら、無くなった物をそのブックのアノテーションのアンカーから外し（core/annotation.ts の prune）、一覧から無くなったブックのアノテーションは消す
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
  if (target === "book" || target === "annotations") {
    const book = bookIn(world, on as { book: string } | undefined)
    if (!book) return { ok: false, reason: "no-book" }
    const annotations = world.annotations[book.id] ?? []
    if (target === "annotations") {
      const done = loose({ book, annotations }, id, args, ctx)
      if (!done.ok) return done
      const next = (done.next as BookAnnotations).annotations
      return next === annotations
        ? { ok: true, result: done.result }
        : { ok: true, result: done.result, annotations: { [book.id]: next } }
    }
    const done = loose(book, id, args, ctx)
    if (!done.ok) return done
    const next = done.next as Book
    if (next.id !== book.id) return { ok: false, reason: "refused" }
    if (next === book) return { ok: true, result: done.result }
    const kept = prune(annotations, next)
    return kept === annotations
      ? { ok: true, result: done.result, book: next }
      : { ok: true, result: done.result, book: next, annotations: { [book.id]: kept } }
  }
  if (target === "library") {
    const done = loose(world.books, id, args, ctx)
    if (!done.ok) return done
    const books = done.next as Library
    const gone = Object.keys(world.annotations).filter(b => !books[b] && (world.annotations[b]?.length ?? 0) > 0)
    return gone.length === 0
      ? { ok: true, result: done.result, books }
      : { ok: true, result: done.result, books, annotations: Object.fromEntries(gone.map(b => [b, []])) }
  }
  const done = loose(world.settings, id, args, ctx)
  if (!done.ok) return done
  const next = done.next as Settings
  const same = sameData(next, world.settings)
  return same ? { ok: true, result: done.result } : { ok: true, result: done.result, settings: next }
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
  }
}

// アクション action が引数 args から答えた、読むだけのブック（world にあるブックだけ。引数が形に合わなければ無し）
function booksRead(world: World, action: ActionDef, args: unknown): Library {
  const parsed = action.args.safeParse(args)
  if (!parsed.success || !action.readsBooks) return {}
  const ids = (action.readsBooks as (args: unknown) => readonly string[])(parsed.data)
  return Object.fromEntries(ids.flatMap(id => (world.books[id] ? [[id, world.books[id]]] : [])))
}

// ブックかアノテーションが対象のアクションの宛先のブック（on のブック。無いか、ゴミ箱のブックなら null）。performIn と permittedIn で同じ決まりを使う
function bookIn(world: World, on: ActionOn | undefined): Book | null {
  const book = world.books[(on && "book" in on ? on.book : undefined) ?? ""]
  return book && book.trashed === undefined ? book : null
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
  if (target === "book" || target === "annotations") {
    const book = bookIn(world, on)
    if (!book) return { ok: false, reason: "no-book" }
    const subject = target === "book" ? book : { book, annotations: world.annotations[book.id] ?? [] }
    return permitted(subject, id, args, ctx)
  }
  if (target !== undefined && isRecordTarget(ctx.catalog, target)) {
    const wanted = on && "record" in on ? on.record : undefined
    const source = world.source ?? sourceOf(world.records)
    const now = wanted === undefined ? NO_RECORD : source.byId(target, wanted)
    return now === undefined
      ? noRecord(ctx.catalog, target, wanted as string)
      : permitted(now, id, args, { ...ctx, [SOURCE]: source, records: {} })
  }
  return permitted(target === "library" ? world.books : world.settings, id, args, ctx)
}
