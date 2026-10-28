// アクションを行う、データを変える入口。対象で使えるアクションかと引数の形を確かめてから run する。
// 使えるかは、book が対象ならそのブックのタイプ、library と settings が対象ならインスタンスのホームのブックのタイプが決める（ホームが無ければ断る）
import type { z } from "zod"
import type { ActionId, ActionTable } from "./catalog"
import { bookType, type CoreCatalog } from "./core-catalog"
import {
  type ActionContext,
  type ActionDef,
  type ActionTarget,
  allowedIn,
  pagedOnly,
  type Subjects,
} from "./def/action"
import { inspect } from "./inspect"
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

// locked はロック中のブック・ページを変えようとしたこと
export type Refusal = "unknown" | "not-allowed" | "bad-args" | "refused" | "locked"
export type Performed<Id extends ActionId> =
  | { ok: true; next: SubjectOf<Id>; result: ResultOf<Id> }
  | { ok: false; reason: Refusal }

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

// アクションが返したブックが、機能台帳のブックの形に合い、データの形の外の決まりも守っているか（型を言い張った所があっても、ここで止める）
function settles(catalog: CoreCatalog, book: Book): boolean {
  return catalog.bookSchema.safeParse(book).success && holds(catalog, book)
}

// ロックの印を除いた中身（ロックの掛け外しのほかに違いがあるかを比べる）
function withoutLock(v: { locked?: true }): string {
  const { locked: _, ...rest } = v
  return JSON.stringify(rest)
}

const pagesOf = (book: Book): readonly { id: string; locked?: true }[] =>
  "pages" in book ? (book.pages as readonly { id: string; locked?: true }[]) : []

// アクションの結果が、ブック before のロックを守っているか（after が無ければ、ブックは一覧から無くなった）。
// ロック中のブックは、ロックの掛け外しのほかは変えない。ロック中のページは、ロックの掛け外しのほかは変えず、消さない。ロックを外せるのは利用者だけ
export function keepsLocks(before: Book, after: Book | undefined, by: ActionContext["by"]): boolean {
  const locked = pagesOf(before).filter(p => p.locked)
  if (!before.locked && locked.length === 0) return true
  if (!after) return false
  if (before.locked && (withoutLock(before) !== withoutLock(after) || (!after.locked && by === "ai"))) return false
  const pages = new Map(pagesOf(after).map(p => [p.id, p]))
  return locked.every(p => {
    const next = pages.get(p.id)
    return next !== undefined && withoutLock(p) === withoutLock(next) && (next.locked || by !== "ai")
  })
}

// 一覧が対象のアクションの結果が、どのブックのロックも守っているか
const libraryKeepsLocks = (before: Library, after: Library, by: ActionContext["by"]): boolean =>
  Object.values(before).every(b => b === after[b.id] || keepsLocks(b, after[b.id], by))

// 使えるかは inspect と同じ決まりで決める（問い合わせの答えと、実際に行えるかを食い違わせない）
function allowed(ctx: ActionContext, action: ActionDef, subject: Subjects[keyof Subjects]): boolean {
  const book = action.target === "book" ? (subject as Book) : undefined
  return inspect(ctx.catalog, { kind: "action", action: action.id, book }, ctx).value === true
}

export function perform<Id extends ActionId>(
  subject: SubjectOf<Id>,
  id: Id,
  args: ArgsOf<Id>,
  ctx: ActionContext,
): Performed<Id> {
  const action: ActionDef | undefined = ctx.catalog.actions.get(id)
  if (!action) return { ok: false, reason: "unknown" }
  if (action.userOnly && ctx.by === "ai") return { ok: false, reason: "not-allowed" }
  if (!allowed(ctx, action, subject)) return { ok: false, reason: "not-allowed" }
  const parsed = action.args.safeParse(args)
  if (!parsed.success) return { ok: false, reason: "bad-args" }
  // 付く先がページを持つタイプだけのアクションに、ページの無いブックは渡さない（run は PagedBook を受ける）
  if (pagedOnly(action.attach) && !("pages" in (subject as Book))) return { ok: false, reason: "refused" }
  const done = action.run(subject as never, parsed.data, ctx)
  if (!done) return { ok: false, reason: "refused" }
  if (action.target === "book" && !keepsLocks(subject as Book, done.next as Book, ctx.by))
    return { ok: false, reason: "locked" }
  if (action.target === "library" && !libraryKeepsLocks(subject as Library, done.next as Library, ctx.by))
    return { ok: false, reason: "locked" }
  if (action.target === "book" && !settles(ctx.catalog, done.next as Book)) return { ok: false, reason: "refused" }
  return { ok: true, next: done.next, result: done.result } as Performed<Id>
}

// アクションが変えるもの全部: ブックの一覧と、見る人の設定
export interface World {
  books: Library
  settings: Settings
}

// performIn の結果。変わったものだけを持つ（book はブックが対象のアクションで変わったブック、books は一覧が対象のアクションの新しい一覧）
export type PerformedIn =
  | { ok: true; result: unknown; book?: Book; books?: Library; settings?: Settings }
  | { ok: false; reason: Refusal | "no-book" }

// 対象を world から選んでアクションを行う（画面の store・常駐・行い直しで同じ決まりを使う）。
// ブックが対象なら on のブックで、id を変えたら断る。同じ値の設定は変わらなかったとみなす
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
  if (target === "book") {
    const book = world.books[on?.book ?? ""]
    if (!book) return { ok: false, reason: "no-book" }
    const done = loose(book, id, args, ctx)
    if (!done.ok) return done
    const next = done.next as Book
    if (next.id !== book.id) return { ok: false, reason: "refused" }
    return next === book ? { ok: true, result: done.result } : { ok: true, result: done.result, book: next }
  }
  const done = loose(target === "library" ? world.books : world.settings, id, args, ctx)
  if (!done.ok) return done
  if (target === "library") return { ok: true, result: done.result, books: done.next as Library }
  const next = done.next as Settings
  const same = JSON.stringify(next) === JSON.stringify(world.settings)
  return same ? { ok: true, result: done.result } : { ok: true, result: done.result, settings: next }
}
