// アクションの定義: できること（動詞）。データを変える入口はアクションだけで、画面の操作も LLM の操作も同じものを通る。
// run は新しい値と結果（作ったものの id など）を返す純粋な関数。対象に合わなければ null を返して断る
import type { z } from "zod"
import { type Actor, isAI } from "../actor"
import type { BookAnnotations } from "../annotation"
import type { ActionExtras, SubjectId, SubjectTable } from "../catalog"
import type { CoreCatalog } from "../core-catalog"
import type { Lang, MessageKey } from "../i18n/i18n"
import type { Library } from "../library"
import type { ItemPage } from "../placed"
import type { Condition, ConditionOf, KeyValuesOf } from "../record-keys"
import type { Records } from "../records"
import type { Book } from "../schema/book"
import type { Settings } from "../settings"
import { type PageTypeDef, placeableOf } from "./page-type"

// 対象ごとの、アクションが受け取って返すデータ。library はブックの一覧、settings は利用者の設定で、
// この 2 つのアクションを使えるかはコントロールセンターが決める。page はページ 1 枚（その中身だけを変える。並びとほかのページは変えない）。
// annotations はブック 1 冊のアノテーション（core/annotation.ts）で、使えるかは book と同じくそのページのタイプが決める
export interface Subjects {
  library: Library
  book: Book
  page: ItemPage
  settings: Settings
  annotations: BookAnnotations
}

// 土台が持つ対象の名前（対象の定義が足した種類は、その id が対象の名前になる）
export const BASE_TARGETS: readonly string[] = ["library", "book", "page", "settings", "annotations"]
export type ActionTarget = keyof Subjects | SubjectId

// 対象の定義の種類 T のレコード 1 件（形は定義の record）
export type RecordOf<T extends string> = T extends keyof SubjectTable
  ? SubjectTable[T] extends { record: infer R extends z.ZodType }
    ? z.output<R>
    : never
  : never
// アクションが受け取る対象: 土台の対象はそのデータ、種類の対象は指したレコードか、新しく作るときの none
export type SubjectData<T extends ActionTarget> = T extends keyof Subjects
  ? Subjects[T]
  : T extends SubjectId
    ? RecordOf<T> | "none"
    : never
// アクションが返す新しい対象: 土台の対象はそのデータ、種類の対象は新しいレコードか、消すときの removed
export type SubjectNext<T extends ActionTarget> = T extends keyof Subjects
  ? Subjects[T]
  : T extends SubjectId
    ? RecordOf<T> | "removed"
    : never

// レコードが対象のアクションが読む物 1 つ: id で 1 件か、索引キーの条件 where に合う全部（keysOnly なら、その id と索引キーの値だけで、中身は読まない）。
// 種類を問わない形（core が引くときに使う）。アクションが書くのは、下の RecordRead
export type AnyRecordRead =
  | { subject: string; id: string }
  | { subject: string; where: readonly Condition[]; keysOnly?: true }
// アクションの reads が答える読む物（種類ごとに、宣言した索引キーの名前と値の型だけを条件に書ける）
export type RecordRead = {
  [S in SubjectId]: { subject: S; id: string } | { subject: S; where: readonly ConditionOf<S>[]; keysOnly?: true }
}[SubjectId]

// アクションの宛先: ブックの id か、ページの id か、レコード（対象の定義が足した種類のデータ）の id
export type ActionOn = { book: string } | { page: string } | { record: string }

// 宛先のブック（on.book）を要る対象か（ブックと、ブックのアノテーション）
export type BookTarget = "book" | "annotations"
export const isOnBook = (target: ActionTarget | undefined): boolean => target === "book" || target === "annotations"
// ブックの中の物を変える対象か（ブック・ページ・ブックのアノテーション。使えるかをページのタイプと認可ステップがブックで決める）
export const isInBook = (target: ActionTarget | undefined): boolean => target === "page" || isOnBook(target)

export interface ActionContext {
  catalog: CoreCatalog // 使う機能台帳（アクション・ページのタイプ・紙など）
  controlCenter: string | null // インスタンスのコントロールセンターの定義の id（一覧と設定のアクションを許すかは、これが決める）。無ければ断る
  lang: Lang
  newId(): string // ブック・ページ・アイテムの id のもとを振る（重ならない値。行い直すときは、先に行ったときと同じ値を同じ順に返す）
  // 行った時点（UTC の ISO 8601。例 2026-10-26T03:04:05.678Z）。最初に行った所（画面、AI ならホスト）が 1 回だけ決め、行い直しでも同じ値。
  // アクションは時刻や乱数を直に使わず、これと newId だけを使う（同じ入力なら同じ結果）
  now: string
  // 許可スコープがページ 1 枚ごとに問う形（pages と denied）のアクションに、名指したページがブックにあるときだけ在る: 名指したページのうち、認可ステップにもページのタイプにも止められなかったページの id（ブックのページの順）
  permittedPages?: readonly string[]
  actor: Actor // 行った者（利用者か AI か。AI には userOnly のアクションとロックを外すことを断る）
  // レコードが対象のアクションが読むだけのブック（アクションの readsBooks が引数から答えた id のブックだけ。ほかのアクションには無い。郵便に乗せる変更を確かめるのに使う）
  books?: Readonly<Library>
  // レコードが対象のアクションが読むだけの、アクションの reads が答えたレコード（種類の id → id → レコード。ほかの対象のアクションには無い）
  records?: Readonly<Records>
  // レコードが対象のアクションが、索引キーだけ読むと宣言した物（reads の keysOnly。種類の id → id → 索引キーの値。中身は読まない）
  keys?: { readonly [S in SubjectId]?: Readonly<Record<string, KeyValuesOf<S>>> }
  // レコードが対象のアクションが、読む物に書いた種類（reads が答えた種類）のレコードと、宛先のレコードが指す先（対象の定義の refers）を、id で 1 件読む（無ければ none）。
  // 読んだ索引キーから相手を決めて、その中身を読むのに使う（引数からは決まらない相手。どちらでもない物は読めず none）
  record?(subject: string, id: string): unknown
  // 番号を振る種類（対象の定義の numbered）のアクションが、区切り scope の次の番号を受け取る。常駐が決めた値で、使い回さない（ほかのアクションには無い）
  number?(scope: string): number
}

// AI 編集チケットの変え方。key で 1 つを見分け（郵便の id など）、ブック book の AI 編集チケットとして、作る（open）・閉じる（closed）・失敗にする（failed。changed は
// 変わった・無くなった物の id）・郵便が消えたと記す（removed。cause は消えたわけ: 上限で消えた limit か、利用者が消した user）。
// 常駐は中を読まずに、そのとおりに残し、失敗と消えたことは次の利用者トリガートークのときに AI に渡す
export type AIEditTicketChange =
  | { book: string; key: string; outcome: "open" | "closed" }
  | { book: string; key: string; outcome: "failed"; changed?: readonly string[] }
  | { book: string; key: string; outcome: "removed"; cause: AIEditTicketRemovedCause }
export type AIEditTicketRemovedCause = "limit" | "user"

// レコードが対象のアクションが、宛先の 1 件のほかに変えるレコード 1 件（record は新しいレコードか、消すなら removed）。
// subject を省けば、対象の種類 T のレコード。別の種類のレコードは subject に種類の id を書く（アクションの定義の writes に書いた種類だけ）
export type OtherRecord<T extends SubjectId> =
  | { subject?: undefined; id: string; record: RecordOf<T> | "removed" }
  | { [S in SubjectId]: { subject: S; id: string; record: RecordOf<S> | "removed" } }[SubjectId]

export interface Done<T extends ActionTarget, R> {
  next: SubjectNext<T>
  result: R
  // レコードが対象のアクションが、宛先のほかに変えるレコード（同じ種類か、writes に書いた種類。宛先と合わせて RECORDS_MAX 件まで。全部が通るか、全部を断る）
  others?: T extends SubjectId ? readonly OtherRecord<T>[] : never
  // レコードが対象のアクションだけが書ける、AI 編集チケットの変え方の並び（宛先と others の変えたレコードと同じ 1 回の書き込みで、順に当てる）
  aiEditTickets?: T extends SubjectId ? readonly AIEditTicketChange[] : never
}

// run が断るときに、断った理由を添える値。declined は AI への説明に載る英語の文（ぶつかった相手や、代わりに入る所など。画面には出さない）。
// kind は断りの種類（プラグインの id の名前空間を付けた名前）。画面が種類で知らせ方を変えるときに書く。理由を添えずに断るなら null を返す
export interface Declined {
  declined: string
  kind?: string
}

// A は引数の形を通した後の値、I は渡す値（ArgsOf はこちら。省いてよい項目は I で省ける）
// 付く先: books はどのブックにも、pages はどのページにも（どちらもページのタイプに依らない。books はブックが対象のアクション、pages はページが対象のアクションが書く）。items はそのアイテムを置けるタイプのページ、presentations はその見せ方のタイプのページ、
// annotations はそのアノテーションの種類を使えるタイプのページ。ページのタイプで決まる付く先（items・presentations・annotations）を持つ、ブックが対象のアクションは、
// 許可スコープでページを名指す（どのページのタイプで決めるかが、そこで決まる。名指さなければ、books の付く先だけで決まる）
export interface ActionAttach {
  items?: readonly string[]
  presentations?: readonly string[]
  books?: true
  pages?: true
  annotations?: readonly string[]
}

// run が受け取る対象: ブックが対象ならブック、ページが対象ならページ
export type RunSubject<T extends ActionTarget, _At> = T extends "book" ? Book : SubjectData<T>

// アクションがタイプ type のページに付くか（attach のどれかに当てはまるか）
export function attachedTo(def: Pick<ActionDef, "attach">, type: PageTypeDef): boolean {
  const a = def.attach
  if (!a) return false
  return (
    a.books === true ||
    a.pages === true ||
    (a.items?.some(id => placeableOf(type).includes(id)) ?? false) ||
    (a.presentations?.includes(type.presentation) ?? false) ||
    (a.annotations?.some(id => !type.annotations?.without?.includes(id as never)) ?? false)
  )
}

// 作るページのタイプが、まだ分からない（どれかのタイプのページを作る。ページを足す入口のボタンなど、タイプを選ぶ前の問い）
export const ANY_PAGE_TYPE = "any"

// 変える所。中身を変える所: page はページの id、ids はそのページの中の id を持つ物（アイテム・形の中身・ページのフィールドの中の物）の id、allPages はどのページも変える。
// 並びを変える所（ページの中身は変えない）: entries は動かす・複製する・消す・名前を変えるエントリ（ページかバインダ）の id、creates は作るページのタイプの id（まだ分からなければ ANY_PAGE_TYPE）。
// どれも無ければ、ブック自身（名前・ブックが持つ設定など）
export interface Where {
  page?: string
  ids?: readonly string[]
  allPages?: true
  entries?: readonly string[]
  creates?: string
}

// 引数の形 A のうち、値の型が V に当たる引数の名前
export type ArgsOfType<A, V> = { [K in keyof A & string]-?: NonNullable<A[K]> extends V ? K : never }[keyof A & string]

// 許可スコープ: ブックが対象のアクションが、どこを変えるかの宣言。認可ステップは、行う前にこの所で問い、使えるかを決めるページのタイプも、この所から決まる
// （ページとその中の物ならそのページのタイプ、エントリならそのページのタイプかバインダに入るページのタイプ、作るページならそのタイプ）。
// "book" はブック自身だけを変える（ページもアイテムも並びも変えない。ページのタイプでは決まらない）。
// page には、ページの id が入っている引数の名前を書く（そのページを丸ごと変える・消す。ページの中身を変えるアクションは、ページを対象にして PagePermissionScope で書く）。
// entry には、エントリ（ページかバインダ）の id が入っている引数の名前を書く（中身を変えずに、動かす・複製する・消す・名前を変える）。
// creates には、作るページのタイプの id が入っている引数の名前を書く。引数の名前で言えなければ、引数から所を返す関数を書く。
// pages と denied: "skip" は、いくつものページをまとめて変えるアクションが書く: pages にはページの id の並びか "all"（ブックの全部のページ）が入っている引数の名前を書く。
// 認可ステップとページのタイプには 1 枚ごとに問い、止められたページは変えずに飛ばす（止められなかったページの id を、run の ctx.permittedPages で受ける）。全部止められたら断る
export type PermissionScope<A = unknown> =
  | "book"
  | { pages: ArgsOfType<A, "all" | readonly string[]>; denied: "skip" }
  | { page: ArgsOfType<A, string> }
  | { entry: ArgsOfType<A, string> }
  | { creates: ArgsOfType<A, string> }
  | ((args: A) => Where)

// ページが対象のアクションの許可スコープ: そのページのどこを変えるかの宣言（ページは宛先で決まる）。
// "page" はページ全体（ページのフィールドや、どの物でも）。item・items には、アイテムの id・アイテムの id の並びが入っている引数の名前を書く。
// 引数の名前で言えなければ、引数から変える物の id の並びを返す関数を書く
export type PagePermissionScope<A = unknown> =
  | "page"
  | { item: ArgsOfType<A, string> }
  | { items: ArgsOfType<A, readonly string[]> }
  | ((args: A) => readonly string[])

// 表に並べたアクションの、ページが対象の許可スコープ（引数の形を問わない形）
export type AnyPagePermissionScope =
  | "page"
  | { item: string }
  | { items: string }
  | ((args: never) => readonly string[])

// ページが対象の許可スコープから、宛先のページ page と引数 args での所を出す
export function pageScopeOf(scope: AnyPagePermissionScope | undefined, page: string, args: unknown): Where {
  if (scope === undefined || scope === "page") return { page }
  if (typeof scope === "function") return { page, ids: (scope as (args: unknown) => readonly string[])(args) }
  const a = args as Record<string, unknown>
  if ("item" in scope) {
    const item = a[scope.item]
    return typeof item === "string" ? { page, ids: [item] } : { page }
  }
  const items = a[scope.items]
  return Array.isArray(items) ? { page, ids: items.filter((id): id is string => typeof id === "string") } : { page }
}

// 表に並べたアクションの許可スコープ（引数の形を問わない形。書くときの型は PermissionScope<A>）
export type AnyPermissionScope =
  | "book"
  | { pages: string; denied: "skip" }
  | { page: string }
  | { entry: string }
  | { creates: string }
  | ((args: never) => Where)

// 利用者の設定が対象のアクションの許可スコープ: どの項目を変えるかの宣言。使えるかは、行う前に項目ごとに問う（core/inspect.ts）。
// settings には、変える項目の id を鍵に持つ引数の名前を書く。引数の名前で言えなければ、引数から変える項目の id を返す関数を書く
export type SettingsScope<A = unknown> =
  | { settings: ArgsOfType<A, Readonly<Record<string, unknown>>> }
  | ((args: A) => readonly string[])

// 表に並べたアクションの、利用者の設定の許可スコープ（引数の形を問わない形）
export type AnySettingsScope = { settings: string } | ((args: never) => readonly string[])

// 一覧が対象のアクションの許可スコープ: どのブックを変えるかの宣言。認可ステップは、行う前に変えるブックごとに問う。
// book・books には、ブックの id・ブックの id の並びが入っている引数の名前を書き、where に "all-pages" を書けば、そのブックのページを含む全部を変える。
// ブックを作るアクションは "create" と書く（認可ステップは、空のブックで問う）。
// 引数の名前で言えなければ、引数から変えるブックを返す関数を書く。行う前に変えるブックが分からなければ "unknown"（行った後の確かめだけで止める）
export type LibraryScope<A = unknown> =
  | "unknown"
  | { book: ArgsOfType<A, string>; where?: "all-pages" }
  | { books: ArgsOfType<A, readonly string[]>; where?: "all-pages" }
  | "create"
  | ((args: A) => LibraryTargets)

// 一覧が対象のアクションが変えるブック: books は今あるブックの id と、その中の所、creates はブックを作るか
export interface LibraryTargets {
  books: readonly { book: string; where: Where }[]
  creates: boolean
}

// 表に並べたアクションの、一覧の許可スコープ（引数の形を問わない形）
export type AnyLibraryScope =
  | "unknown"
  | { book: string; where?: "all-pages" }
  | { books: string; where?: "all-pages" }
  | "create"
  | ((args: never) => LibraryTargets)

// ブックが対象・ページが対象・一覧が対象・利用者の設定が対象のアクションは、許可スコープを必ず書く（defineAction の型が求める）
// 許可スコープが "book"（ブック自身だけを変える）と書いたアクションの印: 定義の型に "book" を残す（ページのタイプが足す・外すアクションの id から外すのに使う。core/def/page-type.ts）
export type OnContainer<Sc> = Sc extends "book" ? { permissionScope: "book" } : unknown

export type ScopeRequired<T extends ActionTarget, A> = T extends "book"
  ? { permissionScope: PermissionScope<A> }
  : T extends "page"
    ? { permissionScope: PagePermissionScope<A> }
    : T extends "library"
      ? { permissionScope: LibraryScope<A> }
      : T extends "settings"
        ? { permissionScope: SettingsScope<A> }
        : unknown

// 一覧の許可スコープから、引数 args で変えるブック（"unknown" なら null）
export function libraryScopeOf(scope: AnyLibraryScope | undefined, args: unknown): LibraryTargets | null {
  if (scope === undefined || scope === "unknown") return null
  if (typeof scope === "function") return (scope as (args: unknown) => LibraryTargets)(args)
  if (scope === "create") return { books: [], creates: true }
  const a = args as Record<string, unknown>
  const where: Where = scope.where === "all-pages" ? { allPages: true } : {}
  const ids = "book" in scope ? [a[scope.book]] : Array.isArray(a[scope.books]) ? (a[scope.books] as unknown[]) : []
  return { books: ids.flatMap(id => (typeof id === "string" ? [{ book: id, where }] : [])), creates: false }
}

// 許可スコープから、引数 args での所を出す
export function scopeOf(scope: AnyPermissionScope | undefined, args: unknown): Where | undefined {
  if (scope === undefined) return undefined
  if (scope === "book") return {}
  if (typeof scope === "function") return (scope as (args: unknown) => Where)(args)
  if ("pages" in scope) return {}
  const a = args as Record<string, unknown>
  const id = (k: string | undefined) => (k !== undefined && typeof a[k] === "string" ? (a[k] as string) : undefined)
  if ("entry" in scope) {
    const entry = id(scope.entry)
    return entry ? { entries: [entry] } : {}
  }
  if ("creates" in scope) {
    const creates = id(scope.creates)
    return creates ? { creates } : {}
  }
  const page = id(scope.page)
  return page ? { page } : {}
}

// 許可スコープが、ページ 1 枚ごとに問う形（pages と denied）なら、引数 args が名指すページ（id の並びか "all"）。その形でなければ null
export function pagesScopeOf(scope: AnyPermissionScope | undefined, args: unknown): "all" | readonly string[] | null {
  if (typeof scope !== "object" || !("pages" in scope)) return null
  const named = (args as Record<string, unknown>)[scope.pages]
  if (named === "all") return "all"
  return Array.isArray(named) ? named.filter((id): id is string => typeof id === "string") : null
}

// 利用者の設定の許可スコープから、引数 args で変える項目の id を出す
export function settingsScopeOf(scope: AnySettingsScope | undefined, args: unknown): readonly string[] | undefined {
  if (scope === undefined) return undefined
  if (typeof scope === "function") return (scope as (args: unknown) => readonly string[])(args)
  const values = (args as Record<string, unknown>)[scope.settings]
  return typeof values === "object" && values !== null ? Object.keys(values) : undefined
}

// 引数から読むブックの id を答える関数（表に並べるとき、引数の型を問わずに並べられるよう、メソッドの形で書く）
type BooksOfArgs<A> = { booksOf(args: A): readonly string[] }["booksOf"]
// 引数・行う者・宛先のレコードの id（作るときは undefined）から読む物を答える関数（同じく、メソッドの形で書く）
type ReadsOfArgs<A> = { readsOf(args: A, actor: Actor, on: string | undefined): readonly RecordRead[] }["readsOf"]

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
  // 利用者が行っても編集ロックで断る（ほかは AI のアクションだけを断る）。行うと、どこかの窓が編集ロックを掛けた物を変えるか消すなら being-edited で断る（stopsOnEditLock）
  lockedForUser?: true
  // 利用者トリガートークのときに、matomezu がアノテーションのあるブックごとに、利用者として行う（引数は {}。アノテーションが対象のアクションだけが書ける）
  runsWhenUserTalks?: T extends "annotations" ? true : never
  // AI が参加を頼むとき（MCP の join）に、matomezu が行う役。"make-participant" は参加者を作り（参加者の id を result の participant で返す）、
  // "notify-user" は利用者に知らせる郵便を、利用者として送る（参加者の id などを受ける。利用者だけが行うアクション）。役ごとに 1 つのアクションだけが名乗る。どちらも対象の定義の種類が対象のアクションだけが書ける
  runsWhenAIJoins?: T extends SubjectId ? "make-participant" | "notify-user" : never
  // 参加者のセッションが終わったと常駐が確かめたとき（セッションと同じだけ生きると名乗られたプロセスが居なくなったとき）に、常駐が利用者として行う（引数は {}、宛先は参加者のレコード。利用者だけが行うアクション。
  // 参加者を外して、ワークルームを空室で残す）。1 つのアクションだけが名乗る。対象の定義の種類が対象のアクションだけが書ける
  runsWhenAIEnds?: T extends SubjectId ? true : never
  // 常駐が初めて起動したとき（その行ったという記録がまだ無いとき）に、利用者として 1 度だけ行う（引数は {}。最初の 1 件を作るなど。行えたら記録し、
  // 利用者があとで消しても作り直さない。行えなければ記録せず、次の起動でまた行う）
  runsOnceAtStart?: true
  // "runs" なら、印刷プレビューの間のステージからも行える（印刷プレビューの見せ方の設定を変えるアクションなど。無ければ、ブックが対象なら止める。core/stage.ts の stageBlocks）
  inPrintPreview?: "runs"
  aiDescription: string // AI 向けの説明（英語。MCP の actions で見せる。どう変わるか・何を返すか・断る場合）
  target: T
  // レコードが対象のアクションが、宛先のほかに読む物を、引数・行う者・宛先のレコードの id から答える（RecordRead の並び: id で 1 件・索引キーの条件に合う全部・その索引キーだけ。
  // 同じ種類の重なりを確かめるときなど）。答えた物だけが ctx.records と ctx.keys に入る。宛先のレコードが指す先（対象の定義の refers）は、書かなくても ctx.record で読める
  reads?: T extends SubjectId ? ReadsOfArgs<A> : never
  // レコードが対象のアクションが、宛先のほかに変える別の種類（種類の id の並び。others の subject に書けるのはこの種類だけ。引数によらない宣言なので、関数でなく並び）
  writes?: T extends SubjectId ? readonly SubjectId[] : never
  // レコードが対象のアクションが読むだけのブックの id を、引数から答える（そのブックだけが ctx.books に入る。無ければブックを読まない）
  readsBooks?: T extends SubjectId ? BooksOfArgs<A> : never
  args: z.ZodType<A, I> // 引数の形（LLM にもこの形で見せる）
  // LLM に見せる引数の形を、機能台帳から組み立てる（ページのタイプが足す項目など。無ければ args）。受け付けるかは run が確かめる
  describeArgs?(catalog: CoreCatalog): z.ZodType
  // 許可スコープ（ブックが対象・ページが対象・一覧が対象・利用者の設定が対象のアクションは必ず書く。どの形かは target で決まる）。
  // ブックとページと一覧では、守るのは認可ステップが行った後に見る実際の変化（PermissionDef の keeps）
  permissionScope?: AnyPermissionScope | AnyPagePermissionScope | AnyLibraryScope | AnySettingsScope
  run(subject: RunSubject<T, At>, args: A, ctx: ActionContext): Done<T, R> | Declined | null
}

// タイプに依らない付く先の書き方は、対象で決まる: ページが対象のアクションは pages、ほかは books（もう一方は型の誤り）
export type AttachFor<T extends ActionTarget> = T extends "page"
  ? { attach?: { books?: never } }
  : { attach?: { pages?: never } }

// 利用者が直している物（編集ロック）を変えるか消すとき、断るアクションか: AI が頼んだアクションと、lockedForUser のアクション（ホストのエンジンが読む）
export const stopsOnEditLock = (action: Pick<ActionDef, "lockedForUser"> | undefined, actor: Actor): boolean =>
  isAI(actor) || action?.lockedForUser === true

// target から run の対象の型を、args の形から引数の型を決め、id は書いた文字のまま残す
export function defineAction<
  const Id extends string,
  T extends ActionTarget,
  A,
  R,
  I,
  const At extends ActionAttach | undefined = undefined,
  const Sc = unknown,
>(
  def: ActionDef<T, A, R, I, MessageKey, At> & { id: Id } & ScopeRequired<T, A> & {
      permissionScope?: Sc
    } & AttachFor<T>,
): ActionDef<T, A, R, I, MessageKey, At> & { id: Id } & OnContainer<Sc> {
  return def as never
}
