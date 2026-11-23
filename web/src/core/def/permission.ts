// 認可ステップの定義: アクションを、ある所（ブック・ページ・アイテム）に対して行ってよいかを決めるステップ。
// アクションを使えるかの問い合わせ（inspect の action）で、タイプのステップの前に並ぶ。止めることはできても、許すことはしない（使えるかはタイプが決める）。
// 止めたステップは問い合わせの答えの decidedBy に出るので、画面の各機能はそれを見て、薄くするか消すかなどを自分で決める。AI には断ったステップの aiDescription を返す。
// 行う前の denies は見せ方のための判断で、守るのは行った後の keeps（行う前に分からなかった所を変えていても、実際の変化で止める）
import type { Actor } from "../actor"
import type { PermissionExtras } from "../catalog"
import type { CoreCatalog } from "../core-catalog"
import type { AnyEntryRef, BackyardEntry, Folder, HomeFolder, PlainFolder } from "../folders"
import type { MessageKey } from "../i18n/i18n"
import type { ItemPage } from "../placed"
import type { RecordReader } from "../record-source"
import type { Book } from "../schema/book"
import type { ActionDef, EntryWhere, Where } from "./action"
import type { SubjectDef } from "./subject"

// ページで問う（行う前）: ページ・アノテーションが対象のアクションを、宛先のページ page に行ってよいか。書庫が対象のアクションが、ブックの外のエントリ（ページ）を変えるときと、
// ブックの外にページを作るときも、これで問う（作るページは、そのタイプの空のページで問う。その id と名前は問うためだけの物で、頼らない）。
// folders は、そのページを入れているフォルダの列（近い順。バインダが在ればバインダ、次にブック。ブックの外のページはバインダだけか空で、作るページは空。
// 書庫ホーム・ゴミ箱・ほかのフォルダは入れない。フォルダの中身は id の並びで、ページの中身は入っていない）。
// where の ids は、引数が名指す、ページの中の物の id（分からなければ無い）。entry は、書庫が対象のアクションが、そのページをエントリとしてどう変えるか（書庫の許可スコープの where）
// backyardEntry は、そのページを入れているブックがバックヤードに直に在るときの、バックヤードの印と workKey
export interface PagePermissionQuery {
  kind: "page"
  action: ActionDef
  page: ItemPage
  folders: readonly Folder[]
  where?: PageWhere
  backyardEntry?: BackyardEntry
  actor: Actor // 問う者
}

// ページで問う問いの所
export interface PageWhere {
  ids?: readonly string[]
  entry?: EntryWhere
}

// フォルダで問う（行う前）: ブックが対象・一覧が対象のアクションを、ブック folder に行ってよいか。folder はアクションが変えるブック（ページとバインダの中身ごと組んだ値）、
// where はその中の所（分からなければ無い）。一覧が対象のアクションは、変えるブックごとに問う。作るブックは、空のブックで問う（その id と名前は問うためだけの物で、頼らない）。
// ページ・アノテーションが対象のアクションも、宛先のページが分からないときは、開いているブックをこれで問う
// backyardEntry は、そのブックがバックヤードに直に在るときの、バックヤードの印と workKey（作るブックには無い）
export interface FolderPermissionQuery {
  kind: "folder"
  action: ActionDef
  folder: Book
  where?: Where
  backyardEntry?: BackyardEntry
  actor: Actor
}

// 行う前と後の、ブック（ページなら入れているブック）のバックヤードの印と workKey（バックヤードに直に無ければ、その側は無い）
export interface BackyardEntries {
  before?: BackyardEntry
  after?: BackyardEntry
}

// レコードが指す、ほかのレコード（対象の定義の refers が答える）と、引いたレコード（無ければ none）
export interface Ref {
  subject: string
  id: string
}
export interface Referred extends Ref {
  record: unknown
}

// レコード（対象の定義が足した種類のデータ）が対象のアクションの、行う前の問い: record は今のレコード（作るなら none）、refs はそのレコードが指すほかのレコード
export interface RecordPermissionQuery {
  kind: "record"
  action: ActionDef
  subject: string
  def: SubjectDef // 対象の定義（ステップが、種類が足した拡張ポイントを読むのに使う）
  record: unknown
  refs: readonly Referred[]
  actor: Actor
}

// 書庫のフォルダ（書庫ホームとフォルダ。システムフォルダも）の行。置き場所の問いと確かめに見せる
export type PlaceFolder = HomeFolder | PlainFolder

// 置き場所の問いと確かめが指すエントリ: 在る物は種類 kind と id、作る物は種類 kind と、作る印 made
export type PlaceEntry = { kind: AnyEntryRef["kind"]; id: string } | { kind: AnyEntryRef["kind"]; made: "new" }

// 置き場所で問う（行う前）: 書庫が対象のアクションが、書庫のフォルダ（書庫ホーム・フォルダ）にエントリを入れる・作るとき、入れる先 into で問う（紙にアイテムを置く事ではない）。
// into は入れる先のフォルダと、その上の書庫のフォルダの列（近い順。書庫ホームまで）。entry は動かす・写す物か、作る物。
// 動かす先が今の直の入れ物と同じ（同じフォルダの中で並びを変えるだけ）なら問わない。引数から入れる先が言えなければ問わない（行った後の確かめが止める）
export interface PlacePermissionQuery {
  kind: "place"
  action: ActionDef
  into: readonly PlaceFolder[]
  entry: PlaceEntry
  actor: Actor
}

// 認可ステップが受ける問い。core がアクションの対象から kind を決めて渡し、ステップは受け取った kind で、自分が読む物だけを扱う
export type PermissionQuery = PagePermissionQuery | FolderPermissionQuery | RecordPermissionQuery | PlacePermissionQuery

// 置き場所の変化: 変わらない（same）・ゴミ箱に入った（trashed）・ゴミ箱から出た（restored）・ゴミ箱の外で、入っているフォルダ（上のどれか）が変わった（moved）
export type PlaceChange = "same" | "trashed" | "restored" | "moved"

// 行う前と後のブックの変化（core が比べて求める）
export interface Changes {
  gone: boolean // ブックが一覧から無くなった
  place: PlaceChange // ブックの置き場所の変化（ブックを中に持つフォルダごと変わったときも）
  added: boolean // ブックが一覧に新しく増えた（fields は増えたブックのフィールド全部、pages はどのページも足した）
  fields: readonly string[] // 変わったブックのフィールド（並び lineup を除く）
  lineup: boolean // 並びが変わった（ページやバインダの順・入っているバインダ・バインダの足し引きと名前。ページの中身の変化は pages）
  pages: readonly PageChange[] // 足した・消した・変わったページ
}

export interface PageChange {
  id: string
  // 足した・消した・変わった、ほかのブックかブックの外から入った（movedIn）・ほかのブックかブックの外へ出た（movedOut）。ゴミ箱から出た・ゴミ箱へ入ったページは、足した・消した物。
  // 動いたページの fields と items は、動く前と後のページを比べた物
  change: "added" | "removed" | "changed" | "movedIn" | "movedOut"
  fields: readonly string[] // 変わったページのフィールド（items と slide を除く。足した・消したページは空）
  items: readonly string[] // 足した・消した・変わったアイテム（ページに直に置いたものと、ページの slide に置いたもの。子の形の変化は、それを持つアイテムの変化）
}

// フォルダの確かめ（行った後）: アクション action の前のブック before（無ければ一覧に新しく増えた）、後のブック after（無ければ一覧から無くなった）と、その変化。
// どの対象のアクションでも、変わったブックごとに確かめる
export interface FolderPermissionCheck {
  kind: "folder"
  action: ActionDef
  before: Book | undefined
  after: Book | undefined
  changes: Changes
  backyardEntry: BackyardEntries
  actor: Actor
}

// レコードが対象のアクションの、行った後の確かめ: before は前のレコード（作ったなら none）、after は後のレコード（消したなら removed）、refs は前後のレコードが指すほかのレコード
export interface RecordPermissionCheck {
  kind: "record"
  action: ActionDef
  subject: string
  def: SubjectDef
  before: unknown
  after: unknown
  refs: readonly Referred[]
  actor: Actor
}

// ページの確かめ（行った後）: ブックの外で変わったページと、ブックとの間を出入りしたページごとに確かめる（ブックの中だけで変わったページは、そのブックの "folder" で確かめる。
// 出入りしたページは、ブックの側の "folder"（PageChange の movedIn・movedOut）と、こちらの両方で確かめる）。
// before・after は前と後のページ（無ければ、足した・無くなった。ゴミ箱の中のページは無い物）、folders はそのページを入れているフォルダの列の前と後
// （近い順。ブックの中ならバインダとブック、ブックの外ならバインダだけで、書庫ホーム・ゴミ箱・ほかのフォルダは入れない）、
// change は前と後のページを比べた変化（足した・消した・変わった。ブックの間を動いたかは place で見る）、place は置き場所の変化
export interface PagePermissionCheck {
  kind: "page"
  action: ActionDef
  before: ItemPage | undefined
  after: ItemPage | undefined
  folders: { before: readonly Folder[]; after: readonly Folder[] }
  change: PageChange
  place: PlaceChange
  backyardEntry: BackyardEntries
  actor: Actor
}

// 置き場所の確かめ（行った後）: 直の入れ物が変わった・増えたエントリ entry ごとに、前と後の、直の入れ物と、その上の書庫のフォルダの列（近い順。PlacePermissionQuery の into と同じ）。
// 直の入れ物が書庫のフォルダでない側（ブック・バインダ・ゴミ箱の中・バックヤード・読めない物のフォルダ・無い）は none。どちらの側も none の物は確かめない。
// フォルダごと動かしたときの中の物は、直の入れ物が変わらないので確かめない（動かしたフォルダの列で分かる）
export interface PlacePermissionCheck {
  kind: "place"
  action: ActionDef
  entry: { kind: AnyEntryRef["kind"]; id: string }
  before: readonly PlaceFolder[] | "none"
  after: readonly PlaceFolder[] | "none"
  actor: Actor
}

export type PermissionCheck = FolderPermissionCheck | PagePermissionCheck | RecordPermissionCheck | PlacePermissionCheck

// 認可ステップが問いと確かめのほかに受ける物: 使う機能台帳と、readsSubjects で宣言した種類だけを読むレコードの読み口
export interface PermissionInput {
  catalog: CoreCatalog
  read: RecordReader
}

export interface PermissionDef<Tt extends string = MessageKey> extends PermissionExtras {
  id: string
  title: Tt
  aiDescription: string // AI に断ったときに返す、何がなぜ止めたかの説明（英語）
  // 問いと確かめで読むレコードの種類（機能台帳から答える。読む id が読んだ中身で決まるので、種類ごと宣言する）。denies と keeps の input の read で、この種類だけを読める
  // （そのアクションを行う時点のレコード。同じアクションバルクの前のアクションが書いた物も重ねる）。無ければ、どの種類も none と空
  readsSubjects?(catalog: CoreCatalog): readonly string[]
  denies(q: PermissionQuery, input: PermissionInput): boolean // 止めるか
  keeps?(c: PermissionCheck, input: PermissionInput): boolean // 結果が許しを守っているか（無ければ守っている）
  // フォローステップが応じた変わり（core/def/follow-step.ts。レコードと、バックヤードの中のブック・ページ）にも keeps（action はきっかけのアクション）をかける。
  // 無いステップは、応じた変わりを止めない
  followed?: true
}
