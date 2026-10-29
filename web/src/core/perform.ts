// アクションを行う、データを変える入口。対象で使えるアクションかと引数の形を確かめてから run する。
// 使えるかは、book が対象ならそのブックのタイプ、library と settings が対象ならインスタンスのホームのブックのタイプが決める（ホームが無ければ断る）。
// その前に許可の段（core/def/permission.ts）が止められ、run の結果も許可の段が守らせることを守っていなければ断る（denied）
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

// denied は許可の段が止めたこと（permission はその段の id）
export type Refusal = "unknown" | "not-allowed" | "bad-args" | "refused"
export type Refused = { ok: false; reason: Refusal } | { ok: false; reason: "denied"; permission: string }
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

// アクションが返したブックが、機能台帳のブックの形に合い、データの形の外の決まりも守っているか（型を言い張った所があっても、ここで止める）
function settles(catalog: CoreCatalog, book: Book): boolean {
  return catalog.bookSchema.safeParse(book).success && holds(catalog, book)
}

// アクションの結果が、許可の段の守らせること（keeps）を守っているか。守っていなければ、守らせた段の id
function broken(catalog: CoreCatalog, before: Book, after: Book | undefined, by: ActionContext["by"]): string | null {
  for (const p of catalog.permissions.values()) if (p.keeps && !p.keeps(before, after, by)) return p.id
  return null
}

// 一覧が対象のアクションの結果で、変わったブックのどれかが守っていなければ、守らせた段の id
function brokenIn(catalog: CoreCatalog, before: Library, after: Library, by: ActionContext["by"]): string | null {
  for (const b of Object.values(before)) {
    const id = b === after[b.id] ? null : broken(catalog, b, after[b.id], by)
    if (id) return id
  }
  return null
}

// 使えるかは inspect と同じ決まりで決める（問い合わせの答えと、実際に行えるかを食い違わせない）。
// 許可の段に渡す所は、ブックが対象ならそのブックと、引数の page（ページの id を page で受けるアクションは、そのページを変える）。
// 一覧が対象のアクションは変えるブックが前に分からないので、許可の段は行った後の keeps だけで見る
function permits(
  ctx: ActionContext,
  action: ActionDef,
  subject: Subjects[keyof Subjects],
  args: unknown,
): { ok: true } | { ok: false; reason: "not-allowed" } | { ok: false; reason: "denied"; permission: string } {
  const book = action.target === "book" ? (subject as Book) : undefined
  const page = (args as { page?: unknown } | null)?.page
  const answer = inspect(
    ctx.catalog,
    {
      kind: "action",
      action: action.id,
      book,
      ...(typeof page === "string" ? { page } : {}),
      ...(ctx.by ? { by: ctx.by } : {}),
    },
    ctx,
  )
  if (answer.value === true) return { ok: true }
  const permission = deniedBy(answer)
  return permission ? { ok: false, reason: "denied", permission } : { ok: false, reason: "not-allowed" }
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
  const parsed = action.args.safeParse(args)
  const permitted = permits(ctx, action, subject, parsed.data)
  if (!permitted.ok) return permitted
  if (!parsed.success) return { ok: false, reason: "bad-args" }
  // 付く先がページを持つタイプだけのアクションに、ページの無いブックは渡さない（run は PagedBook を受ける）
  if (pagedOnly(action.attach) && !("pages" in (subject as Book))) return { ok: false, reason: "refused" }
  const done = action.run(subject as never, parsed.data, ctx)
  if (!done) return { ok: false, reason: "refused" }
  const permission =
    action.target === "book"
      ? broken(ctx.catalog, subject as Book, done.next as Book, ctx.by)
      : action.target === "library"
        ? brokenIn(ctx.catalog, subject as Library, done.next as Library, ctx.by)
        : null
  if (permission) return { ok: false, reason: "denied", permission }
  if (action.target === "book" && !settles(ctx.catalog, done.next as Book)) return { ok: false, reason: "refused" }
  return { ok: true, next: done.next, result: done.result } as Performed<Id>
}

// アクションが変えるもの全部: ブックの一覧（ゴミ箱のブックも）と、見る人の設定
export interface World {
  books: Library
  settings: Settings
}

// performIn の結果。変わったものだけを持つ（book はブックが対象のアクションで変わったブック、books は一覧が対象のアクションの新しい一覧）
export type PerformedIn =
  | { ok: true; result: unknown; book?: Book; books?: Library; settings?: Settings }
  | Refused
  | { ok: false; reason: "no-book" }

// 対象を world から選んでアクションを行う（画面の store・常駐・行い直しで同じ決まりを使う）。
// ブックが対象なら on のブックで（ゴミ箱のブックは無いものとして断る）、id を変えたら断る。同じ値の設定は変わらなかったとみなす
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
    if (!book || book.trashed !== undefined) return { ok: false, reason: "no-book" }
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
