// アクションの定義: できること（動詞）。データを変える入口はアクションだけで、画面の操作も LLM の操作も同じものを通る。
// run は新しい値と結果（作ったものの id など）を返す純粋な関数。対象に合わなければ null を返して断る
import type { z } from "zod"
import { type Actor, isAI } from "../actor"
import type { BookAnnotations } from "../annotation"
import type { PagedBook } from "../book"
import type { ActionExtras, SubjectId, SubjectTable } from "../catalog"
import type { CoreCatalog } from "../core-catalog"
import type { Lang, MessageKey } from "../i18n/i18n"
import type { Library } from "../library"
import type { Condition } from "../record-keys"
import type { RecordKeys } from "../record-source"
import type { Records } from "../records"
import type { Book } from "../schema/book"
import type { Settings } from "../settings"
import { type BookTypeDef, placeableOf } from "./book-type"

// 対象ごとの、アクションが受け取って返すデータ。library はブックの一覧、settings は利用者の設定で、
// この 2 つのアクションを使えるかはコントロールセンターが決める。annotations はブック 1 冊のアノテーション（core/annotation.ts）で、
// 使えるかは book と同じくそのブックのタイプが決める
export interface Subjects {
  library: Library
  book: Book
  settings: Settings
  annotations: BookAnnotations
}

// 土台が持つ対象の名前（対象の定義が足した種類は、その id が対象の名前になる）
export const BASE_TARGETS: readonly string[] = ["library", "book", "settings", "annotations"]
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

// レコードが対象のアクションが読む物 1 つ: id で 1 件か、索引キーの条件 where に合う全部（keysOnly なら、その id と索引キーの値だけで、中身は読まない）
export type RecordRead =
  | { subject: string; id: string }
  | { subject: string; where: readonly Condition[]; keysOnly?: true }

// アクションの宛先: ブックの id か、レコード（対象の定義が足した種類のデータ）の id
export type ActionOn = { book: string } | { record: string }

// 宛先のブック（on.book）を要る対象か（ブックと、ブックのアノテーション）
export type BookTarget = "book" | "annotations"
export const isOnBook = (target: ActionTarget | undefined): boolean => target === "book" || target === "annotations"

export interface ActionContext {
  catalog: CoreCatalog // 使う機能台帳（アクション・ブックのタイプ・紙など）
  controlCenter: string | null // インスタンスのコントロールセンターの定義の id（一覧と設定のアクションを許すかは、これが決める）。無ければ断る
  lang: Lang
  newId(): string // ブック・ページ・アイテムの id のもとを振る（重ならない値。行い直すときは、先に行ったときと同じ値を同じ順に返す）
  // 行った時点（UTC の ISO 8601。例 2026-10-26T03:04:05.678Z）。最初に行った所（画面、AI ならホスト）が 1 回だけ決め、行い直しでも同じ値。
  // アクションは時刻や乱数を直に使わず、これと newId だけを使う（同じ入力なら同じ結果）
  now: string
  actor: Actor // 行った者（利用者か AI か。AI には userOnly のアクションとロックを外すことを断る）
  // レコードが対象のアクションが読むだけのブック（アクションの readsBooks が引数から答えた id のブックだけ。ほかのアクションには無い。郵便に乗せる変更を確かめるのに使う）
  books?: Readonly<Library>
  // レコードが対象のアクションが読むだけの、アクションの reads の種類のレコード（種類の id → id → レコード。ほかの対象のアクションには無い）
  records?: Readonly<Records>
  // レコードが対象のアクションが、索引キーだけ読むと宣言した物（reads の keysOnly。種類の id → id → 索引キーの値。中身は読まない）
  keys?: RecordKeys
  // レコードが対象のアクションが、読む物に書いた種類（reads の関数が答えた種類）のレコードを、id で 1 件読む（無ければ none）。
  // 読んだ索引キーから相手を決めて、その中身を読むのに使う（引数からは決まらない相手。reads に無い種類は読めず none）
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

// レコードが対象のアクションが、宛先の 1 件のほかに変える、同じ種類のレコード 1 件（record は新しいレコードか、消すなら removed）
export interface OtherRecord<T extends SubjectId> {
  id: string
  record: RecordOf<T> | "removed"
}

export interface Done<T extends ActionTarget, R> {
  next: SubjectNext<T>
  result: R
  // レコードが対象のアクションが、宛先のほかに変える同じ種類のレコード（宛先と合わせて RECORDS_MAX 件まで。全部が通るか、全部を断る）
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
  : SubjectData<T>

// アクションがタイプ type に付くか（attach のどれかに当てはまるか）
export function attachedTo(def: Pick<ActionDef, "attach">, type: BookTypeDef): boolean {
  const a = def.attach
  if (!a) return false
  return (
    a.books === true ||
    (a.pages === true && type.pages !== null) ||
    (a.items?.some(id => placeableOf(type).includes(id)) ?? false) ||
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
export type ArgsOfType<A, V> = { [K in keyof A & string]-?: NonNullable<A[K]> extends V ? K : never }[keyof A & string]

// 許可スコープ: ブックが対象のアクションが、ブックのどこを変えるかの宣言。認可ステップは、行う前にこの所で問う。
// "book" はページもアイテムも変えない。page・item・items には、ページの id・アイテムの id・アイテムの id の並びが入っている引数の名前を書く。
// 引数の名前で言えなければ、引数から所を返す関数を書く
export type PermissionScope<A = unknown> =
  | "book"
  | { page: ArgsOfType<A, string>; item?: ArgsOfType<A, string>; items?: ArgsOfType<A, readonly string[]> }
  | ((args: A) => Where)

// 表に並べたアクションの許可スコープ（引数の形を問わない形。書くときの型は PermissionScope<A>）
export type AnyPermissionScope =
  | "book"
  | { page: string; item?: string | undefined; items?: string | undefined }
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

// 表に並べたアクションの、一覧の許可スコープ（引数の形を問わない形）
export type AnyLibraryScope =
  | "unknown"
  | { book: string; where?: "all-pages" }
  | { books: string; where?: "all-pages" }
  | { create: string }
  | ((args: never) => LibraryTargets)

// ブックが対象・一覧が対象・利用者の設定が対象のアクションは、許可スコープを必ず書く（defineAction の型が求める）
export type ScopeRequired<T extends ActionTarget, A> = T extends "book"
  ? { permissionScope: PermissionScope<A> }
  : T extends "library"
    ? { permissionScope: LibraryScope<A> }
    : T extends "settings"
      ? { permissionScope: SettingsScope<A> }
      : unknown

// 一覧の許可スコープから、引数 args で変えるブック（"unknown" なら null）
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

// 許可スコープから、引数 args での所を出す
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

// 利用者の設定の許可スコープから、引数 args で変える項目の id を出す
export function settingsScopeOf(scope: AnySettingsScope | undefined, args: unknown): readonly string[] | undefined {
  if (scope === undefined) return undefined
  if (typeof scope === "function") return (scope as (args: unknown) => readonly string[])(args)
  const values = (args as Record<string, unknown>)[scope.settings]
  return typeof values === "object" && values !== null ? Object.keys(values) : undefined
}

// 引数から読むブックの id を答える関数（表に並べるとき、引数の型を問わずに並べられるよう、メソッドの形で書く）
type BooksOfArgs<A> = { booksOf(args: A): readonly string[] }["booksOf"]
// 引数と行う者から読む物を答える関数（同じく、メソッドの形で書く）
type ReadsOfArgs<A> = { readsOf(args: A, actor: Actor): readonly RecordRead[] }["readsOf"]

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
  // 常駐が初めて起動したとき（その行ったという記録がまだ無いとき）に、利用者として 1 度だけ行う（引数は {}。最初の 1 件を作るなど。行えたら記録し、
  // 利用者があとで消しても作り直さない。行えなければ記録せず、次の起動でまた行う）
  runsOnceAtStart?: true
  // "runs" なら、印刷プレビューの間のステージからも行える（印刷プレビューの見せ方の設定を変えるアクションなど。無ければ、ブックが対象なら止める。core/stage.ts の stageBlocks）
  inPrintPreview?: "runs"
  aiDescription: string // AI 向けの説明（英語。MCP の actions で見せる。どう変わるか・何を返すか・断る場合）
  target: T
  // レコードが対象のアクションが、読むだけの種類（対象の定義の id。その種類のレコード全部が ctx.records に入る。同じ種類の重なりを確かめるときなど。変えるのは対象の種類のレコードだけで、宛先のほかも変える〈Done の others〉なら、対象の種類も書く）
  // 関数なら、読む物を引数と行う者から答える（RecordRead の並び: id で 1 件・索引キーの条件に合う全部・その索引キーだけ）。答えた物だけが ctx.records と ctx.keys に入る。
  // レコードが指す先（対象の定義の refers）は core が読むので、書かなくてよい
  reads?: T extends SubjectId ? readonly SubjectId[] | ReadsOfArgs<A> : never
  // レコードが対象のアクションが読むだけのブックの id を、引数から答える（そのブックだけが ctx.books に入る。無ければブックを読まない）
  readsBooks?: T extends SubjectId ? BooksOfArgs<A> : never
  args: z.ZodType<A, I> // 引数の形（LLM にもこの形で見せる）
  // LLM に見せる引数の形を、機能台帳から組み立てる（ブックのタイプが足す項目など。無ければ args）。受け付けるかは run が確かめる
  describeArgs?(catalog: CoreCatalog): z.ZodType
  // 許可スコープ（ブックが対象・一覧が対象・利用者の設定が対象のアクションは必ず書く。どの形かは target で決まる）。
  // ブックと一覧では、守るのは認可ステップが行った後に見る実際の変化（PermissionDef の keeps）
  permissionScope?: AnyPermissionScope | AnyLibraryScope | AnySettingsScope
  // 付く先がページを持つタイプだけ（pages・items）なら、ブックは PagedBook で来る
  run(subject: RunSubject<T, At>, args: A, ctx: ActionContext): Done<T, R> | Declined | null
}

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
>(
  def: ActionDef<T, A, R, I, MessageKey, At> & { id: Id } & ScopeRequired<T, A>,
): ActionDef<T, A, R, I, MessageKey, At> & { id: Id } {
  return def
}
