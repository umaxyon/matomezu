// アクションの定義: できること（動詞）。データを変える入口はアクションだけで、画面の操作も LLM の操作も同じものを通る。
// run は新しい値と結果（作ったものの id など）を返す純粋な関数。対象に合わなければ null を返して断る
import type { z } from "zod"
import type { PagedBook } from "../book"
import type { ActionExtras, ActionId } from "../catalog"
import type { CoreCatalog } from "../core-catalog"
import type { Lang, MessageKey } from "../i18n/i18n"
import type { Library } from "../library"
import type { Book } from "../schema/book"
import type { Settings } from "../settings"
import type { BookTypeDef } from "./book-type"

// 対象ごとの、アクションが受け取って返すデータ。library はブックの一覧、settings は見る人ごとの設定で、
// この 2 つのアクションを使えるかはホームのブックのタイプが決める
export interface Subjects {
  library: Library
  book: Book
  settings: Settings
}

export type ActionTarget = keyof Subjects

export interface ActionContext {
  catalog: CoreCatalog // 使う機能台帳（アクション・ブックのタイプ・紙など）
  home: string | null // インスタンスのホームのブックの id（一覧と設定のアクションを許すかは、このブックのタイプが決める）。無ければ断る
  lang: Lang
  newId(): string // ブック・ページ・アイテムの id のもとを振る（重ならない値。行い直すときは、先に行ったときと同じ値を同じ順に返す）
  // 行った時点（UTC の ISO 8601。例 2026-10-26T03:04:05.678Z）。最初に行った所（画面、AI ならホスト）が 1 回だけ決め、行い直しでも同じ値。
  // アクションは時刻や乱数を直に使わず、これと newId だけを使う（同じ入力なら同じ結果）
  now: string
  by?: "ai" // 頼んだのが AI か（無ければ利用者。AI には userOnly のアクションとロックを外すことを断る）
}

export interface Done<T extends ActionTarget, R> {
  next: Subjects[T]
  result: R
}

// A は引数の形を通した後の値、I は渡す値（ArgsOf はこちら。省いてよい項目は I で省ける）
// 付く先: items はそのアイテムを置けるタイプ、presentations はその見せ方のタイプ、pages はページを持つタイプ、books はどのタイプも
export interface ActionAttach {
  items?: readonly string[]
  presentations?: readonly string[]
  pages?: true
  books?: true
}

// 付く先がページを持つタイプだけか（pages か items だけを書き、books・presentations を書いていない）。
// そうなら run にはページを持つブックだけが来る（perform がページの無いブックには断る）
type PagedOnly = ({ pages: true } | { items: readonly string[] }) & { books?: undefined; presentations?: undefined }
export const pagedOnly = (attach: ActionAttach | undefined): boolean =>
  attach !== undefined &&
  attach.books === undefined &&
  attach.presentations === undefined &&
  (attach.pages === true || attach.items !== undefined)

// run が受け取る対象: ブックが対象で、付く先がページを持つタイプだけなら PagedBook
export type RunSubject<T extends ActionTarget, At> = T extends "book"
  ? At extends PagedOnly
    ? PagedBook
    : Book
  : Subjects[T]

// アクションがタイプ type に付くか（attach のどれかに当てはまるか）
export function attachedTo(def: Pick<ActionDef, "attach">, type: BookTypeDef): boolean {
  const a = def.attach
  if (!a) return false
  return (
    a.books === true ||
    (a.pages === true && type.pages !== null) ||
    (a.items?.some(id => type.items.allowed.includes(id)) ?? false) ||
    (a.presentations?.includes(type.presentation) ?? false)
  )
}

// タイプ type でアクションを使えるか: タイプが外していなければ、タイプが足したか、付く先が当てはまるか（core/inspect.ts の段と同じ決まり）
export function allowedIn(def: Pick<ActionDef, "id" | "attach">, type: BookTypeDef): boolean {
  if (type.actions.without?.includes(def.id as ActionId)) return false
  return (type.actions.add?.includes(def.id as ActionId) ?? false) || attachedTo(def, type)
}

// ブックの中の所: page はページの id、items はそのページのアイテムの id
export interface Where {
  page?: string
  items?: readonly string[]
}

// 引数の形 A のうち、値の型が V に当たる引数の名前
type ArgsOfType<A, V> = { [K in keyof A & string]-?: NonNullable<A[K]> extends V ? K : never }[keyof A & string]

// 許可の範囲: ブックが対象のアクションが、ブックのどこを変えるかの宣言。認可ステップは、行う前にこの所で問う。
// "book" はページもアイテムも変えない。page・item・items には、ページの id・アイテムの id・アイテムの id の並びが入っている引数の名前を書く。
// 引数の名前で言えなければ、引数から所を返す関数を書く
export type PermissionScope<A = unknown> =
  | "book"
  | { page: ArgsOfType<A, string>; item?: ArgsOfType<A, string>; items?: ArgsOfType<A, readonly string[]> }
  | ((args: A) => Where)

// 表に並べたアクションの許可の範囲（引数の形を問わない形。書くときの型は PermissionScope<A>）
export type AnyPermissionScope =
  | "book"
  | { page: string; item?: string | undefined; items?: string | undefined }
  | ((args: never) => Where)

// ブックが対象のアクションは、許可の範囲を必ず書く（defineAction の型が求める）
export type ScopeRequired<T extends ActionTarget, A> = T extends "book"
  ? { permissionScope: PermissionScope<A> }
  : unknown

// 許可の範囲から、引数 args での所を出す
export function scopeOf(scope: AnyPermissionScope | undefined, args: unknown): Where | undefined {
  if (scope === undefined) return undefined
  if (scope === "book") return {}
  if (typeof scope === "function") return (scope as (args: unknown) => Where)(args)
  const a = args as Record<string, unknown>
  const id = (k: string | undefined) => (k !== undefined && typeof a[k] === "string" ? (a[k] as string) : undefined)
  const page = id(scope.page)
  const item = id(scope.item)
  const items = scope.items !== undefined && Array.isArray(a[scope.items]) ? (a[scope.items] as string[]) : undefined
  return { ...(page ? { page } : {}), ...(item ? { items: [item] } : items ? { items } : {}) }
}

export interface ActionDef<
  T extends ActionTarget = ActionTarget,
  A = unknown,
  R = unknown,
  I = unknown,
  Tt extends string = MessageKey,
  At extends ActionAttach | undefined = ActionAttach | undefined,
> extends ActionExtras {
  id: string // 本当の id。名前は「対象-動き」（例: page-add）
  title: Tt
  // ブックが対象のアクションの付く先。どれか 1 つに当てはまるタイプのブックで使える（無ければ、タイプの actions.add で選ばれたときだけ）
  attach?: At
  userOnly?: true // 利用者だけが行える（AI には断り、MCP 公開ツールの actions に出さない）
  aiDescription: string // AI 向けの説明（英語。MCP の actions で見せる。どう変わるか・何を返すか・断る場合）
  target: T
  args: z.ZodType<A, I> // 引数の形（LLM にもこの形で見せる）
  // LLM に見せる引数の形を、機能台帳から組み立てる（ブックのタイプが足す項目など。無ければ args）。受け付けるかは run が確かめる
  describeArgs?(catalog: CoreCatalog): z.ZodType
  // 許可の範囲（ブックが対象のアクションは必ず書く）。守るのは、認可ステップが行った後に見る実際の変化（PermissionDef の keeps）
  permissionScope?: AnyPermissionScope
  // 付く先がページを持つタイプだけ（pages・items）なら、ブックは PagedBook で来る
  run(subject: RunSubject<T, At>, args: A, ctx: ActionContext): Done<T, R> | null
}

// target から run の対象の型を、args の形から引数の型を決め、id は書いた文字のまま残す
export function defineAction<
  const Id extends string,
  T extends ActionTarget,
  A,
  R,
  I,
  const At extends ActionAttach | undefined = undefined,
>(
  def: ActionDef<T, A, R, I, MessageKey, At> & { id: Id } & ScopeRequired<T, A>,
): ActionDef<T, A, R, I, MessageKey, At> & { id: Id } {
  return def
}
