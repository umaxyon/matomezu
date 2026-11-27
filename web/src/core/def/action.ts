// アクションの定義: できること（動詞）。データを変える入口はアクションだけで、画面の操作も AI の操作も同じものを通る。
// run は新しい値と結果（作ったものの id など）を返す純粋な関数。対象に合わなければ null を返して断る

import type { z } from "zod"
import { type Actor, isAI } from "../actor"
import type { PageAnnotations } from "../annotation"
import type { ActionExtras, SubjectId, SubjectTable } from "../catalog"
import type { CoreCatalog } from "../core-catalog"
import type { Naming } from "../entries"
import type { Library } from "../folders"
import type { HostRole } from "../hosts"
import type { Lang, MessageKey } from "../i18n/i18n"
import type { Books } from "../library"
import type { ItemPage } from "../placed"
import type { Condition, ConditionOf, KeyValuesOf } from "../record-keys"
import type { Records } from "../records"
import type { Book, StageLineup } from "../schema/book"
import type { Settings } from "../settings"
import { type PageTypeDef, placeableOf } from "./page-type"

// 対象ごとの、アクションが受け取って返すデータ。library は書庫（ページの行と、フォルダの行。core/folders.ts）、settings は利用者の設定で、
// この 2 つのアクションを使えるかはコントロールセンターが決める。page はページ 1 枚（その中身だけを変える。並びとほかのページは変えない）。
// annotations はページ 1 枚のアノテーション（core/annotation.ts）で、使えるかは page と同じくそのページのタイプが決める
export interface Subjects {
  library: Library
  book: Book
  page: ItemPage
  settings: Settings
  annotations: PageAnnotations
}

// 土台が持つ対象の名前（対象の定義が足した種類は、その id が対象の名前になる）
export const BASE_TARGETS: readonly string[] = ["library", "book", "page", "settings", "annotations"]
export type ActionTarget = keyof Subjects | SubjectId

// AI が参加を頼むときに matomezu が行う役（アクションの定義の runsWhenAIJoins の値）: 参加者を作る・受け入れ済みの参加者の頼み直しを書く
export type JoinRole = "make-participant" | "rejoin-participant"

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

// 宛先のページ（on.page）を要る対象か（ページと、ページのアノテーション）
export type PageTarget = "page" | "annotations"
export const isOnPage = (target: ActionTarget | undefined): boolean => target === "page" || target === "annotations"
// ステージエントリの中の物を変える対象か（ブック・ページ・ページのアノテーション。使えるかを、ページのタイプと認可ステップが、開いているステージエントリで決める）
export const isInStageEntry = (target: ActionTarget | undefined): boolean => target === "book" || isOnPage(target)

// インスタンスにコントロールセンターが無いときの、controlCenter の値
export const NO_CONTROL_CENTER = "none"

export interface ActionContext {
  catalog: CoreCatalog // 使う機能台帳（アクション・ページのタイプ・紙など）
  // インスタンスのコントロールセンターの定義の id（書庫と設定が対象のアクションを許すかは、これが決める）。無ければ NO_CONTROL_CENTER で、断る
  controlCenter: string | typeof NO_CONTROL_CENTER
  lang: Lang
  newId(): string // ブック・ページ・アイテムの id のもとを振る（重ならない値。行い直すときは、先に行ったときと同じ値を同じ順に返す）
  // 行った時点（UTC の ISO 8601。例 2026-10-26T03:04:05.678Z）。最初に行った所（画面、AI ならホスト）が 1 回だけ決め、行い直しでも同じ値。
  // アクションは時刻や乱数を直に使わず、これと today と newId だけを使う（同じ入力なら同じ結果）
  now: string
  // 日付（now の時点の、利用者の暦の日付。YYYY-MM-DD）。now と同じく最初に行った所が 1 回だけ決め、行い直しでも同じ値
  today: string
  // 許可スコープがページ 1 枚ごとに問う形（pages と denied）のアクションに、名指したページがブックにあるときだけ在る: 名指したページのうち、認可ステップにもページのタイプにも止められなかったページの id（ブックのページの順）
  permittedPages?: readonly string[]
  // エントリの名前を引く決まり（利用者の設定の言語。performIn が世界の設定から、どの対象のアクションにも入れる）。名前は core/entries.ts の titleOf などに渡して引く
  naming: Naming
  actor: Actor // 行った者（利用者か AI か。AI には userOnly のアクションとロックを外すことを断る）
  // レコードが対象のアクションが読むだけのブック（アクションの readsBooks が引数から答えた id のブックだけ。ほかのアクションには無い。郵便に乗せる変更を確かめるのに使う）
  books?: Readonly<Books>
  // レコードが対象のアクションが読むだけの、アクションの reads が答えたレコード（種類の id → id → レコード。ほかの対象のアクションには無い）
  records?: Readonly<Records>
  // レコードが対象のアクションが、索引キーだけ読むと宣言した物（reads の keysOnly。種類の id → id → 索引キーの値。中身は読まない）
  keys?: { readonly [S in SubjectId]?: Readonly<Record<string, KeyValuesOf<S>>> }
  // レコードが対象のアクションが、読む物に書いた種類（reads が答えた種類）のレコードと、宛先のレコードが指す先（対象の定義の refers）を、id で 1 件読む（無ければ none）。
  // 読んだ索引キーから相手を決めて、その中身を読むのに使う（引数からは決まらない相手。どちらでもない物は読めず none）。
  // 書庫が対象のアクションでは、readsSubjects に書いた種類のレコードを読む（ほかは none）
  record?(subject: string, id: string): unknown
  // 書庫が対象のアクションが、readsSubjects に書いた種類のレコードのうち、索引キーの条件 where に合う物を読む（ほかの種類は空。ほかの対象のアクションには無い）
  find?(subject: string, where: readonly Condition[]): readonly unknown[]
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

// レコードが対象のアクションが送る AI 間メッセージ 1 通: 宛先のワークルームの id と文。送り手は行った参加者で、ここには書かない。
// 返せるのは、行う者がワークルームに入っている AI のときだけ。常駐は、アクションバルクが通ったときだけ送る。
// 宛先のワークルームに参加の確定したほかの参加者がいないとき、noRecipient が refuse（省いたとき）ならバルクごと断り（no-recipient）、skip ならその 1 通を送らないだけにする（送らなかったことは返さない）。AI ラリーの上限を超える 1 通も同じ（断るときは rally-limit）
export interface AIMessage {
  workroom: string
  text: string
  noRecipient?: AIMessageNoRecipient
}
export type AIMessageNoRecipient = "refuse" | "skip"

// レコードが対象のアクションが、宛先の 1 件のほかに変えるレコード 1 件（record は新しいレコードか、消すなら removed）。
// subject を省けば、対象の種類 T のレコード。別の種類のレコードは subject に種類の id を書く（アクションの定義の writes に書いた種類だけ）
export type OtherRecord<T extends SubjectId> =
  | { subject?: undefined; id: string; record: RecordOf<T> | "removed" }
  | { [S in SubjectId]: { subject: S; id: string; record: RecordOf<S> | "removed" } }[SubjectId]

export interface Done<T extends ActionTarget, R, Sc = "book", Tk = unknown> {
  next: T extends "book" ? RunSubject<T, Sc, Tk> : SubjectNext<T>
  result: R
  // レコードが対象のアクションが、宛先のほかに変えるレコード（同じ種類か、writes に書いた種類。宛先と合わせて RECORDS_MAX 件まで。全部が通るか、全部を断る）
  others?: T extends SubjectId ? readonly OtherRecord<T>[] : never
  // レコードが対象のアクションだけが書ける、AI 編集チケットの変え方の並び（宛先と others の変えたレコードと同じ 1 回の書き込みで、順に当てる）
  aiEditTickets?: T extends SubjectId ? readonly AIEditTicketChange[] : never
  // レコードが対象のアクションだけが書ける、送る AI 間メッセージの並び（AIMessage）
  aiMessages?: T extends SubjectId ? readonly AIMessage[] : never
  // リフレッシュリクエスト（RefreshRequest）。書庫が対象のアクションとレコードが対象のアクションが書ける
  refreshRequest?: T extends SubjectId | "library" ? RefreshRequest : never
}

// リフレッシュリクエスト: 行った AI の会話を、このターンの終わりに空にする頼み。text は、空にしたあとの新しい会話に打つ英語の文。
// 返せるのは、行う者がワークルームに入っている AI のときだけで、1 つのアクションバルクに 1 つまで。
// 常駐は、アクションバルクが通ったときだけ行った参加者に覚え、AI のプログラムの部品が訊いたときに渡す（空にできると名乗っていない参加者なら、バルクごと断る）
export interface RefreshRequest {
  text: string
}

// run が断るときに、断った理由を添える値。declined は AI への説明に載る英語の文（ぶつかった相手や、代わりに入る所など。画面には出さない）。
// kind は断りの種類（プラグインの id の名前空間を付けた名前）。画面が種類で知らせ方を変えるときに書く。理由を添えずに断るなら null を返す
export interface Declined {
  declined: string
  kind?: string
}

// A は引数の形を通した後の値、I は渡す値（ArgsOf はこちら。省いてよい項目は I で省ける）
// 付く先: books はどのブックにも、pages はどのページにも（どちらもページのタイプに依らない。books はブックが対象のアクション、pages はページが対象のアクションが書く）。items はそのアイテムを置けるタイプのページ、presentations はそのプレゼンテーションのタイプのページ、
// slides は形だけの並び（ページの slide）を持つタイプのページ、annotations はそのアノテーションの種類を使えるタイプのページ。ページのタイプで決まる付く先（items・presentations・slides・annotations）を持つ、ブックが対象のアクションは、
// 許可スコープでページを名指す（どのページのタイプで決めるかが、そこで決まる。名指さなければ、books の付く先だけで決まる）
export interface ActionAttach {
  items?: readonly string[]
  presentations?: readonly string[]
  slides?: true
  books?: true
  pages?: true
  annotations?: readonly string[]
}

// run が受け取る対象: ブックが対象なら、ブック自身だけを変えるアクション（許可スコープ Sc が "book"）と、takesBook を書いたアクション（Tk が true）はブック、
// ほかは並び（StageLineup）。ページが対象ならページ
export type RunSubject<T extends ActionTarget, Sc, Tk = unknown> = T extends "book"
  ? [Sc] extends ["book"]
    ? Book
    : [Tk] extends [true]
      ? Book
      : StageLineup
  : SubjectData<T>

// アクションがタイプ type のページに付くか（attach のどれかに当てはまるか）
export function attachedTo(def: Pick<ActionDef, "attach">, type: PageTypeDef): boolean {
  const a = def.attach
  if (!a) return false
  return (
    a.books === true ||
    a.pages === true ||
    (a.items?.some(id => placeableOf(type).includes(id)) ?? false) ||
    (a.presentations?.includes(type.presentation) ?? false) ||
    (a.slides === true && type.slide !== undefined) ||
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
  place?: true // 書庫の中の、ブックの置き場所だけ（書庫が対象のアクションが、ブックを動かすだけで、ブックの中は何も変えない）
  // entries を、エントリとして変える印（書庫が対象のアクションが添える）: 置き場所だけ（place。ブックの中で並べ替える・ブックの間を動かす。ページの中身は変えない）か、
  // 名前だけ（title）。無ければ、エントリをほかの変え方（写す・中身ごと）で扱う
  entriesChange?: "place" | "title"
}

// 引数の形 A のうち、値の型が V に当たる引数の名前
export type ArgsOfType<A, V> = { [K in keyof A & string]-?: NonNullable<A[K]> extends V ? K : never }[keyof A & string]

// 許可スコープ: ブックが対象のアクションが、どこを変えるかの宣言。認可ステップは、行う前にこの所で問い、使えるかを決めるページのタイプも、この所から決まる
// （ページならそのページのタイプ、エントリならそのページのタイプかバインダに入るページのタイプ、作るページならそのタイプ）。
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

// 書庫が対象のアクションの許可スコープ: どのブックを変えるかの宣言。認可ステップは、行う前に変えるブックごとに問う。
// book・books には、ブックの id・ブックの id の並びが入っている引数の名前を書き、where に "all-pages" を書けば、そのブックのページを含む全部を変える。
// ブックを作るアクションは "create" と書く（認可ステップは、空のブックで問う）。
// entry・entries には、エントリ（ブック・フォルダ・ページ・バインダ）の id・id の並びが入っている引数の名前を書き、where に、そのエントリをどう変えるかを書く:
// "all-pages" は中身ごと（ゴミ箱に入れる・消す）、"place" は置き場所だけ、"title" は名前だけ、"copy" は複製して隣に足す。どこに、どの所で問うかは、core がエントリから出す
// （ブックならそのブックに、中身ごとなら全部のページ・置き場所だけなら置き場所・名前だけならブック自身の所で。フォルダなら中のブックの全部と、中のブックの外のページの全部に同じく
// （名前だけ・複製だけなら、どれにも問わない）。ブックの中のページ・バインダなら、そのブックのそのエントリに、動かす・名前を変えるなら印 entriesChange を添えて。
// ブックの外のページならそのページに、ブックの外のバインダなら中のページの全部に（名前だけ・複製だけ・設定の項目の値だけなら問わない）、ページへの問いとして、エントリの変え方を where の entry に添えて）。
// entry の動かす先のフォルダの id が入っている引数の名前を into に書けば、先がほかのブックかその中のとき、そのブックにも入るエントリとして問う。
// 引数の名前で言えなければ、引数から変えるブックを返す関数を書く。行う前に変えるブックが分からなければ "unknown"（行った後の確かめだけで止める）
export type LibraryScope<A = unknown> =
  | "unknown"
  | { book: ArgsOfType<A, string>; where?: "all-pages" }
  | { books: ArgsOfType<A, readonly string[]>; where?: "all-pages" }
  | { entry: ArgsOfType<A, string>; where: EntryWhere; into?: ArgsOfType<A, string> }
  | { entries: ArgsOfType<A, readonly string[]>; where: EntryWhere }
  | "create"
  | ((args: A) => LibraryTargets)

// 書庫が対象のアクションが、名指したエントリをどう変えるか
// （"copy" は、複製して隣に足す。エントリそのものは変えない。"settings" は、ステージエントリが持つ設定の項目の値だけを変える）
export type EntryWhere = "all-pages" | "place" | "title" | "copy" | "settings"

// 書庫が対象のアクションが変える物: books は今あるブックの id と、その中の所、entries は名指したエントリと、その変え方（どのブックか、どのページに問うかは、core が出す）、
// creates は作るブック・フォルダの種類 kind と、入れるフォルダの id into（ブックを作るなら、空のブックで問う。into を書けば、書庫のフォルダなら置き場所でも問う。書かなければ置き場所では問わない）、
// pages は作るページのタイプ creates と、入れるフォルダの id into（引数が名指すときだけ。core が、ブックかその中ならそのブックに作るページのタイプで、
// ほかなら、そのタイプの空のページで問う。書庫のフォルダなら置き場所でも問う。into を省いたときにアクションが決める先には問わない）
export interface LibraryTargets {
  books: readonly { book: string; where: Where }[]
  entries?: readonly { entry: string; where: EntryWhere; into?: string }[]
  creates: readonly { kind: "book" | "folder"; into?: string }[]
  pages?: readonly { creates: string; into?: string }[]
}
// 何も作らない（LibraryTargets の creates）
export const CREATES_NOTHING: LibraryTargets["creates"] = []

// 表に並べたアクションの、書庫の許可スコープ（引数の形を問わない形）
export type AnyLibraryScope =
  | "unknown"
  | { book: string; where?: "all-pages" }
  | { books: string; where?: "all-pages" }
  | { entry: string; where: EntryWhere; into?: string }
  | { entries: string; where: EntryWhere }
  | "create"
  | ((args: never) => LibraryTargets)

// ブックが対象・ページが対象・書庫が対象・利用者の設定が対象のアクションは、許可スコープを必ず書く（defineAction の型が求める）
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

// 書庫の許可スコープから、引数 args で変えるブック（"unknown" なら null）
export function libraryScopeOf(scope: AnyLibraryScope | undefined, args: unknown): LibraryTargets | null {
  if (scope === undefined || scope === "unknown") return null
  if (typeof scope === "function") return (scope as (args: unknown) => LibraryTargets)(args)
  if (scope === "create") return { books: [], creates: [{ kind: "book" }] }
  const a = args as Record<string, unknown>
  const named = (one: unknown, many: unknown): string[] =>
    (many === undefined ? [one] : Array.isArray(many) ? many : []).filter((id): id is string => typeof id === "string")
  if ("entry" in scope || "entries" in scope) {
    const ids = "entry" in scope ? named(a[scope.entry], undefined) : named(undefined, a[scope.entries] ?? [])
    const into = "into" in scope && scope.into !== undefined ? a[scope.into] : undefined
    return {
      books: [],
      entries: ids.map(entry => ({ entry, where: scope.where, ...(typeof into === "string" ? { into } : {}) })),
      creates: CREATES_NOTHING,
    }
  }
  const where: Where = scope.where === "all-pages" ? { allPages: true } : {}
  const ids = "book" in scope ? named(a[scope.book], undefined) : named(undefined, a[scope.books] ?? [])
  return { books: ids.map(book => ({ book, where })), creates: CREATES_NOTHING }
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

// 窓を開いたときのアクション（ActionDef の runsAtWindowStart）が受ける、窓から決まる事。lang は窓の言語（その窓の ctx.lang と同じ値）
export type WindowStart = { lang: Lang }

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
  Sc = unknown,
  Tk = unknown,
> extends ActionExtras {
  id: string // 本当の id。名前は「対象-動き」（例: page-add）
  title: Tt
  // ブック・ページ・アノテーションが対象のアクションの付く先。どれか 1 つに当てはまるタイプのブックで使える（無ければ、タイプの actions.add で選ばれたときだけ）
  attach?: At
  userOnly?: true // 利用者だけが行える（AI には断り、MCP 公開ツールの actions に出さない。core/inspect.ts のステップ）
  history?: false // 画面の履歴（Undo）に入れない（図の内容でなくブックの扱いを変えるアクション。ロックの掛け外しや、戻す・やり直すの置き直しなど）
  // "alone" は、同じ同期の処理の中で行っても、ほかのアクションと別の、自分だけのアクションバルクにする（郵便の既読のように、ほかのアクションの成否と一緒に決めないレコードの変更。
  // 成否を共にすべき物〈変更提案郵便の反映と、反映したと郵便に残すアクションなど〉には書かない）。書かなければ、同じ処理のほかのアクションと 1 つのアクションバルクになる。種類が対象のアクションだけが書ける
  bulk?: T extends SubjectId ? "alone" : never
  // 利用者が行っても編集ロックで断る（ほかは AI のアクションだけを断る）。行うと、どこかの窓が編集ロックを掛けた物を変えるか消すなら being-edited で断る（stopsOnEditLock）
  lockedForUser?: true
  // 利用者トリガートークのときに、matomezu がアノテーションのある読めるページごとに、利用者として行う（引数は {}。アノテーションが対象のアクションだけが書ける）
  runsWhenUserTalks?: T extends "annotations" ? true : never
  // AI が参加を頼むとき（MCP の join）に、matomezu が行う役。"make-participant" は参加者を作る（参加者の id を result の participant で返す）。
  // "rejoin-participant" は、受け入れ済みの参加者が参加を頼み直したときに、常駐が利用者として、その参加者のレコードに行う（引数は make-participant と同じ。書き換えるかは run が決める）。
  // 値ごとに 1 つのアクションだけが名乗る。対象の定義の種類が対象のアクションだけが書ける
  runsWhenAIJoins?: T extends SubjectId ? JoinRole : never
  // 利用者が要求中の参加者を、断りでなくキャンセルとして終える（常駐は、これで要求中の参加者が消えたら、AI に断りでなくキャンセルと知らせる。
  // 名乗らないアクションで消えたら断り）。1 つのアクションだけが名乗る。対象の定義の種類が対象のアクションだけが書ける
  cancelsJoinRequest?: T extends SubjectId ? true : never
  // 参加者のセッションが終わったと常駐が確かめたとき（セッションと同じだけ生きると名乗られたプロセスが居なくなったとき）に、常駐が利用者として行う（引数は {}、宛先は参加者のレコード。利用者だけが行うアクション。
  // 参加者を外して、ワークルームを空室で残す）。1 つのアクションだけが名乗る。対象の定義の種類が対象のアクションだけが書ける
  runsWhenAIEnds?: T extends SubjectId ? true : never
  // ほかのホストに応じて（ペアリングの頼みが届いた・取り下げられた・受け入れの答えが届いた・相手がペアリングを解いた など）、常駐が利用者として行う役（HOST_ROLES）。
  // 役ごとに 1 つのアクションだけが名乗る。利用者だけが行うアクション（userOnly）で、対象の定義の種類が対象のアクションだけが書ける
  runsBetweenHosts?: T extends SubjectId ? HostRole : never
  // 常駐が初めて起動したとき（その行ったという記録がまだ無いとき）に、利用者として 1 度だけ行う（引数は {}。最初の 1 件を作るなど。行えたら記録し、
  // 利用者があとで消しても作り直さない。行えなければ記録せず、次の起動でまた行う）
  runsOnceAtStart?: true
  // 画面の窓を開いて常駐につながったときに、その窓が利用者として 1 度行う。窓から決まる事（WindowStart）と機能台帳を受けて、行う引数を答える（行わないなら null）。
  // 窓から決まる値〈窓の言語など〉を、まだ無いときだけ書くなど。窓がいくつ開いても、行う前に在る物は変えない作りにする（行うかの条件は run の中で確かめる）
  runsAtWindowStart?(window: WindowStart, catalog: CoreCatalog): I | null
  // "runs" なら、印刷プレビューの間のステージからも行える（印刷プレビューの見せ方の設定を変えるアクションなど。無ければ、ブック・ページ・アノテーションが対象なら止める。core/stage.ts の stageBlocks）
  inPrintPreview?: "runs"
  aiDescription: string // AI 向けの説明（英語。MCP の actions で見せる。どう変わるか・何を返すか・断る場合）
  target: T
  // レコードが対象のアクションが、宛先のほかに読む物を、引数・行う者・宛先のレコードの id から答える（RecordRead の並び: id で 1 件・索引キーの条件に合う全部・その索引キーだけ。
  // 同じ種類の重なりを確かめるときなど）。答えた物だけが ctx.records と ctx.keys に入る。宛先のレコードが指す先（対象の定義の refers）は、書かなくても ctx.record で読める
  reads?: T extends SubjectId ? ReadsOfArgs<A> : never
  // レコードが対象のアクションが、宛先のほかに変える別の種類（種類の id の並び。others の subject に書けるのはこの種類だけ。引数によらない宣言なので、関数でなく並び）
  writes?: T extends SubjectId ? readonly SubjectId[] : never
  // 書庫が対象のアクションが読むレコードの種類を、機能台帳から答える（読む id が読んだ中身で決まるので、種類ごと宣言する）。その種類だけを ctx.record と ctx.find で読める
  readsSubjects?: T extends "library" ? (catalog: CoreCatalog) => readonly string[] : never
  // レコードが対象のアクションが読むだけのブックの id を、引数から答える（そのブックだけが ctx.books に入る。無ければブックを読まない）
  readsBooks?: T extends SubjectId ? BooksOfArgs<A> : never
  args: z.ZodType<A, I> // 引数の形（AI にもこの形で見せる）
  // AI に見せる引数の形を、機能台帳から組み立てる（ページのタイプが足す項目など。無ければ args）。受け付けるかは run が確かめる
  describeArgs?(catalog: CoreCatalog): z.ZodType
  // 許可スコープ（ブックが対象・ページが対象・書庫が対象・利用者の設定が対象のアクションは必ず書く。どの形かは target で決まる）。
  // ブックとページと書庫では、守るのは認可ステップが行った後に見る実際の変化（PermissionDef の keeps）
  permissionScope?: AnyPermissionScope | AnyPagePermissionScope | AnyLibraryScope | AnySettingsScope
  // run がブックそのもの（名前・設定も）を受け、ブックにだけ行える（ブックの外のバインダには行えない）。ブックが対象で、許可スコープが "book" でないアクションだけが書ける
  // （許可スコープが "book" のアクションは、書かなくても同じ）
  takesBook?: T extends "book" ? ([Sc] extends ["book"] ? never : Tk & true) : never
  run(subject: RunSubject<T, Sc, Tk>, args: A, ctx: ActionContext): Done<T, R, Sc, Tk> | Declined | null
}

// ブック自身だけを変えるアクションか（ブックが対象で、許可スコープが "book"）。ページを名指さないので、ページのタイプでは使えるかが決まらない
export const changesBookOnly = (def: Pick<ActionDef, "target" | "permissionScope">): boolean =>
  def.target === "book" && def.permissionScope === "book"

// run がブックそのものを受けるアクションか（ブック自身だけを変えるか、takesBook を書いた、ブックが対象のアクション）。ブックにだけ行え、ブックの外のバインダには行えない
export const takesBook = (def: Pick<ActionDef, "target" | "permissionScope" | "takesBook">): boolean =>
  changesBookOnly(def) || (def.target === "book" && def.takesBook === true)

// タイプに依らない付く先の書き方は、対象で決まる: ページが対象のアクションは pages、ほかは books（もう一方は型の誤り）
export type AttachFor<T extends ActionTarget> = T extends "page"
  ? { attach?: { books?: never } }
  : { attach?: { pages?: never } }

// 利用者が直している物（編集ロック）を変えるか消すとき、断るアクションか: AI が頼んだアクションと、lockedForUser のアクション（ホストのエンジンが読む）。
// フォローステップが応じて変えた物は、これによらず断る（engine/host-perform.ts）
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
  const Tk = unknown,
>(
  def: ActionDef<T, A, R, I, MessageKey, At, Sc, Tk> & { id: Id } & ScopeRequired<T, A> & {
      permissionScope?: Sc
      takesBook?: Tk
    } & AttachFor<T>,
): ActionDef<T, A, R, I, MessageKey, At, Sc, Tk> & { id: Id } & OnContainer<Sc> {
  return def as never
}
