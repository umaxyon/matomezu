// アクションを行う、データを変える入口。対象で使えるアクションかと引数の形を確かめてから run する。
// 使えるかは、book と annotations が対象ならそのブックのタイプ、library と settings が対象ならインスタンスのホームのブックのタイプが決める（ホームが無ければ断る）。
// その前に認可ステップ（core/def/permission.ts）が止められ、run の結果も認可ステップが守らせることを守っていなければ断る（denied）
import type { z } from "zod"
import { type Annotations, annotationsSettle, type BookAnnotations, prune } from "./annotation"
import type { ActionId, ActionTable } from "./catalog"
import { changesOf } from "./changes"
import { bookType, type CoreCatalog } from "./core-catalog"
import {
  type ActionContext,
  type ActionDef,
  type ActionTarget,
  type AnyPermissionScope,
  type AnySettingsScope,
  allowedIn,
  pagedOnly,
  type Subjects,
  scopeOf,
  settingsScopeOf,
} from "./def/action"
import { deniedBy, inspect } from "./inspect"
import type { Library } from "./library"
import { type ItemPage, pageHolds } from "./placed"
import type { Book } from "./schema/book"
import type { Settings } from "./settings"

type ActionOf<Id extends ActionId> = ActionTable[Id]
export type TargetOf<Id extends ActionId> = ActionOf<Id>["target"]
export type SubjectOf<Id extends ActionId> = Subjects[ActionOf<Id>["target"]]
export type ArgsOf<Id extends ActionId> = z.input<ActionOf<Id>["args"]>
export type ResultOf<Id extends ActionId> =
  ActionOf<Id> extends ActionDef<infer _T, infer _A, infer R, infer _I> ? R : never

// denied は認可ステップが止めたこと（permission はそのステップの id）。not-allowed で止めたのが利用者の設定の項目ごとのステップなら、
// setting にその項目の id、because に理由（user-only は利用者だけが変える項目、fixed はホームのタイプが変えさせない項目）
export type Refusal = "unknown" | "not-allowed" | "bad-args" | "refused"
export type NotAllowed = { ok: false; reason: "not-allowed"; setting?: string; because?: "user-only" | "fixed" }
export type Refused =
  | { ok: false; reason: Exclude<Refusal, "not-allowed"> }
  | NotAllowed
  | { ok: false; reason: "denied"; permission: string }
export type Performed<Id extends ActionId> = { ok: true; next: SubjectOf<Id>; result: ResultOf<Id> } | Refused

// タイプで使えるアクション（表の並び）: タイプが選んだ物に付くアクションとタイプが足すアクションから、タイプが外すアクションを除く（inspect と同じ決まり）
function typeActions(catalog: CoreCatalog, type: string): readonly string[] {
  const t = bookType(catalog, type)
  return [...catalog.actions.values()].filter(a => allowedIn(a, t)).map(a => a.id)
}

// ブックで使えるアクション
export const actionsOf = (catalog: CoreCatalog, book: Book): readonly string[] => typeActions(catalog, book.type)

// ホームのブックで使えるアクション（ホームが無ければ無い）。ホームは 1 冊だけのタイプで、ブックの id はタイプの id
export const homeActions = (catalog: CoreCatalog, home: string | null): readonly string[] =>
  home === null ? [] : typeActions(catalog, home)

// ブックが、データの形の外の決まり（アイテムどうしの関係）を守っているか: タイプの決まりと、どのページもつなぐものの定義の決まり
export function holds(catalog: CoreCatalog, book: Book): boolean {
  if (!(bookType(catalog, book.type).holds?.(book, catalog) ?? true)) return false
  return !("pages" in book) || (book.pages as readonly ItemPage[]).every(p => pageHolds(catalog, p))
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

// アクションの結果が、認可ステップの守らせること（keeps）を守っているか。守っていなければ、守らせたステップの id
function broken(ctx: ActionContext, action: ActionDef, before: Book, after: Book | undefined): string | null {
  const changes = changesOf(before, after)
  const by = ctx.by ? { by: ctx.by } : {}
  for (const p of ctx.catalog.permissions.values())
    if (p.keeps && !p.keeps({ action, before, after, changes, ...by })) return p.id
  return null
}

// 一覧が対象のアクションの結果で、変わったブックのどれかが守っていなければ、守らせたステップの id
function brokenIn(ctx: ActionContext, action: ActionDef, before: Library, after: Library): string | null {
  for (const b of Object.values(before)) {
    const id = b === after[b.id] ? null : broken(ctx, action, b, after[b.id])
    if (id) return id
  }
  return null
}

// 使えるかは inspect と同じ決まりで決める（問い合わせの答えと、実際に行えるかを食い違わせない）。利用者の設定が対象なら、許可の範囲で引数から出した変える項目の id も渡す。
// 認可ステップに渡す所は、ブックが対象ならそのブックと、アクションの許可の範囲（permissionScope）で引数から出す所（無ければ分からないとして渡す）。
// 一覧が対象のアクションは変えるブックが前に分からないので、認可ステップは行った後の keeps だけで見る
function permits(
  ctx: ActionContext,
  action: ActionDef,
  subject: Subjects[keyof Subjects],
  args: { success: true; data: unknown } | { success: false },
): { ok: true } | NotAllowed | { ok: false; reason: "denied"; permission: string } {
  const book =
    action.target === "book"
      ? (subject as Book)
      : action.target === "annotations"
        ? (subject as BookAnnotations).book
        : undefined
  const where =
    args.success && action.target === "book"
      ? scopeOf(action.permissionScope as AnyPermissionScope, args.data)
      : undefined
  const settings =
    args.success && action.target === "settings"
      ? settingsScopeOf(action.permissionScope as AnySettingsScope, args.data)
      : undefined
  const answer = inspect(
    ctx.catalog,
    {
      kind: "action",
      action: action.id,
      book,
      ...(where ? { where } : {}),
      ...(settings ? { settings } : {}),
      ...(ctx.by ? { by: ctx.by } : {}),
    },
    ctx,
  )
  if (answer.value === true) return { ok: true }
  const permission = deniedBy(answer)
  if (permission) return { ok: false, reason: "denied", permission }
  const from = answer.decidedBy
  if (from?.source === "userSetting")
    return { ok: false, reason: "not-allowed", setting: from.id, because: "user-only" }
  if (from?.source === "bookType" && from.field === "fixedUserSettings")
    return { ok: false, reason: "not-allowed", setting: from.setting, because: "fixed" }
  return { ok: false, reason: "not-allowed" }
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
  const permitted = permits(ctx, action, subject, parsed)
  if (!permitted.ok) return permitted
  if (!parsed.success) return { ok: false, reason: "bad-args" }
  // 付く先がページを持つタイプだけのアクションに、ページの無いブックは渡さない（run は PagedBook を受ける）
  if (pagedOnly(action.attach) && !("pages" in (subject as Book))) return { ok: false, reason: "refused" }
  const ran = action.run(subject as never, parsed.data, ctx)
  if (!ran) return { ok: false, reason: "refused" }
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
  if (action.target === "book" && !settles(ctx.catalog, done.next as Book)) return { ok: false, reason: "refused" }
  if (action.target === "annotations") {
    const next = (done.next as unknown as BookAnnotations).annotations
    if (!annotationsSettle(ctx.catalog, pair.book, pair.annotations, next)) return { ok: false, reason: "refused" }
  }
  return { ok: true, next: done.next, result: done.result } as Performed<Id>
}

// アクションが変えるもの全部: ブックの一覧（ゴミ箱のブックも）と、利用者の設定と、ブックごとのアノテーション
export interface World {
  books: Library
  settings: Settings
  annotations: Annotations
}

// performIn の結果。変わったものだけを持つ（book はブックが対象のアクションで変わったブック、books は一覧が対象のアクションの新しい一覧、
// annotations はアノテーションが変わったブックの id → 新しい並び。アノテーションが対象のアクションのほか、ブックの物が消えたときと、ブックが一覧から無くなったときにも変わる）
export type PerformedIn =
  | { ok: true; result: unknown; book?: Book; books?: Library; settings?: Settings; annotations?: Annotations }
  | Refused
  | { ok: false; reason: "no-book" }

// 対象を world から選んでアクションを行う（画面の store・常駐・行い直しで同じ決まりを使う）。
// ブックとアノテーションが対象なら on のブックで（ゴミ箱のブックは無いものとして断る）、ブックの id を変えたら断る。同じ値の設定は変わらなかったとみなす。
// ブックが変わったら、無くなった物をそのブックのアノテーションのアンカーから外し（core/annotation.ts の prune）、一覧から無くなったブックのアノテーションは消す
export function performIn(
  world: World,
  id: string,
  args: unknown,
  on: { book: string } | undefined,
  ctx: ActionContext,
): PerformedIn {
  const target: ActionTarget | undefined = ctx.catalog.actions.get(id)?.target
  const loose = perform as (
    subject: unknown,
    id: string,
    args: unknown,
    ctx: ActionContext,
  ) => ReturnType<typeof perform>
  if (target === "book" || target === "annotations") {
    const book = world.books[on?.book ?? ""]
    if (!book || book.trashed !== undefined) return { ok: false, reason: "no-book" }
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
  const same = JSON.stringify(next) === JSON.stringify(world.settings)
  return same ? { ok: true, result: done.result } : { ok: true, result: done.result, settings: next }
}
