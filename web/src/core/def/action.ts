// アクションの定義: できること（動詞）。データを変える入口はアクションだけで、画面の操作も LLM の操作も同じものを通る。
// run は新しい値と結果（作ったものの id など）を返す純粋な関数。対象に合わなければ null を返して断る
import type { z } from "zod"
import type { BookAnnotations } from "../annotation"
import type { PagedBook } from "../book"
import type { ActionExtras } from "../catalog"
import type { CoreCatalog } from "../core-catalog"
import type { Lang, MessageKey } from "../i18n/i18n"
import type { Library } from "../library"
import type { Book } from "../schema/book"
import type { Settings } from "../settings"
import type { BookTypeDef } from "./book-type"

// 対象ごとの、アクションが受け取って返すデータ。library はブックの一覧、settings は利用者の設定で、
// この 2 つのアクションを使えるかはホームのブックのタイプが決める。annotations はブック 1 冊のアノテーション（core/annotation.ts）で、
// 使えるかは book と同じくそのブックのタイプが決める
export interface Subjects {
  library: Library
  book: Book
  settings: Settings
  annotations: BookAnnotations
}

export type ActionTarget = keyof Subjects

// 宛先のブック（on.book）を要る対象か（ブックと、ブックのアノテーション）
export type BookTarget = "book" | "annotations"
export const isOnBook = (target: ActionTarget | undefined): boolean => target === "book" || target === "annotations"

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
// 付く先: items はそのアイテムを置けるタイプ、presentations はその見せ方のタイプ、pages はページを持つタイプ、books はどのタイプも、
// annotations はそのアノテーションの種類を使えるタイプ
export interface ActionAttach {
  items?: readonly string[]
  presentations?: readonly string[]
  pages?: true
  books?: true
  annotations?: readonly string[]
}

// 付く先がページを持つタイプだけか（pages か items だけを書き、books・presentations を書いていない）。
// そうなら run にはページを持つブックだけが来る（perform がページの無いブックには断る）
type PagedOnly = ({ pages: true } | { items: readonly string[] }) & {
  books?: undefined
  presentations?: undefined
  annotations?: undefined
}
export const pagedOnly = (attach: ActionAttach | undefined): boolean =>
  attach !== undefined &&
  attach.books === undefined &&
  attach.presentations === undefined &&
  attach.annotations === undefined &&
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
    (a.presentations?.includes(type.presentation) ?? false) ||
    (a.annotations?.some(id => !type.annotations?.without?.includes(id as never)) ?? false)
  )
}

// ブックの中の所: page はページの id、ids はそのページの中の id を持つ物（アイテム・形の中身・ページのフィールドの中の物）の id、allPages はページを含むブックの全部（どのページも変える）
export interface Where {
  page?: string
  ids?: readonly string[]
  allPages?: true
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

// 利用者の設定が対象のアクションの許可の範囲: どの項目を変えるかの宣言。使えるかは、行う前に項目ごとに問う（core/inspect.ts）。
// settings には、変える項目の id を鍵に持つ引数の名前を書く。引数の名前で言えなければ、引数から変える項目の id を返す関数を書く
export type SettingsScope<A = unknown> =
  | { settings: ArgsOfType<A, Readonly<Record<string, unknown>>> }
  | ((args: A) => readonly string[])

// 表に並べたアクションの、利用者の設定の許可の範囲（引数の形を問わない形）
export type AnySettingsScope = { settings: string } | ((args: never) => readonly string[])

// 一覧が対象のアクションの許可の範囲: どのブックを変えるかの宣言。認可ステップは、行う前に変えるブックごとに問う。
// book・books には、ブックの id・ブックの id の並びが入っている引数の名前を書き、where に "all-pages" を書けば、そのブックのページを含む全部を変える。
// create には、作るブックのタイプの id が入っている引数の名前を書く（認可ステップは、そのタイプで作る空のブックで問う）。
// 引数の名前で言えなければ、引数から変えるブックを返す関数を書く。行う前に変えるブックが分からなければ "unknown"（行った後の確かめだけで止める）
export type LibraryScope<A = unknown> =
  | "unknown"
  | { book: ArgsOfType<A, string>; where?: "all-pages" }
  | { books: ArgsOfType<A, readonly string[]>; where?: "all-pages" }
  | { create: ArgsOfType<A, string> }
  | ((args: A) => LibraryTargets)

// 一覧が対象のアクションが変えるブック: books は今あるブックの id と、その中の所、creates は作るブックのタイプの id
export interface LibraryTargets {
  books: readonly { book: string; where: Where }[]
  creates: readonly string[]
}

// 表に並べたアクションの、一覧の許可の範囲（引数の形を問わない形）
export type AnyLibraryScope =
  | "unknown"
  | { book: string; where?: "all-pages" }
  | { books: string; where?: "all-pages" }
  | { create: string }
  | ((args: never) => LibraryTargets)

// ブックが対象・一覧が対象・利用者の設定が対象のアクションは、許可の範囲を必ず書く（defineAction の型が求める）
export type ScopeRequired<T extends ActionTarget, A> = T extends "book"
  ? { permissionScope: PermissionScope<A> }
  : T extends "library"
    ? { permissionScope: LibraryScope<A> }
    : T extends "settings"
      ? { permissionScope: SettingsScope<A> }
      : unknown

// 一覧の許可の範囲から、引数 args で変えるブック（"unknown" なら null）
export function libraryScopeOf(scope: AnyLibraryScope | undefined, args: unknown): LibraryTargets | null {
  if (scope === undefined || scope === "unknown") return null
  if (typeof scope === "function") return (scope as (args: unknown) => LibraryTargets)(args)
  const a = args as Record<string, unknown>
  if ("create" in scope) {
    const type = a[scope.create]
    return { books: [], creates: typeof type === "string" ? [type] : [] }
  }
  const where: Where = scope.where === "all-pages" ? { allPages: true } : {}
  const ids = "book" in scope ? [a[scope.book]] : Array.isArray(a[scope.books]) ? (a[scope.books] as unknown[]) : []
  return { books: ids.flatMap(id => (typeof id === "string" ? [{ book: id, where }] : [])), creates: [] }
}

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
  return { ...(page ? { page } : {}), ...(item ? { ids: [item] } : items ? { ids: items } : {}) }
}

// 利用者の設定の許可の範囲から、引数 args で変える項目の id を出す
export function settingsScopeOf(scope: AnySettingsScope | undefined, args: unknown): readonly string[] | undefined {
  if (scope === undefined) return undefined
  if (typeof scope === "function") return (scope as (args: unknown) => readonly string[])(args)
  const values = (args as Record<string, unknown>)[scope.settings]
  return typeof values === "object" && values !== null ? Object.keys(values) : undefined
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
  userOnly?: true // 利用者だけが行える（AI には断り、MCP 公開ツールの actions に出さない。core/inspect.ts のステップ）
  history?: false // 画面の履歴（Undo）に入れない（図の内容でなくブックの扱いを変えるアクション。ロックの掛け外しなど）
  // "runs" なら、印刷プレビューの間のステージからも行える（印刷プレビューの見せ方の設定を変えるアクションなど。無ければ、ブックが対象なら止める。core/stage.ts の stageBlocks）
  inPrintPreview?: "runs"
  aiDescription: string // AI 向けの説明（英語。MCP の actions で見せる。どう変わるか・何を返すか・断る場合）
  target: T
  args: z.ZodType<A, I> // 引数の形（LLM にもこの形で見せる）
  // LLM に見せる引数の形を、機能台帳から組み立てる（ブックのタイプが足す項目など。無ければ args）。受け付けるかは run が確かめる
  describeArgs?(catalog: CoreCatalog): z.ZodType
  // 許可の範囲（ブックが対象・一覧が対象・利用者の設定が対象のアクションは必ず書く。どの形かは target で決まる）。
  // ブックと一覧では、守るのは認可ステップが行った後に見る実際の変化（PermissionDef の keeps）
  permissionScope?: AnyPermissionScope | AnyLibraryScope | AnySettingsScope
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
