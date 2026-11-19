// 認可ステップの定義: アクションを、ある所（ブック・ページ・アイテム）に対して行ってよいかを決めるステップ。
// アクションを使えるかの問い合わせ（inspect の action）で、タイプのステップの前に並ぶ。止めることはできても、許すことはしない（使えるかはタイプが決める）。
// 止めたステップは問い合わせの答えの decidedBy に出るので、画面の各機能はそれを見て、薄くするか消すかなどを自分で決める。AI には断ったステップの aiDescription を返す。
// 行う前の denies は見せ方のための判断で、守るのは行った後の keeps（行う前に分からなかった所を変えていても、実際の変化で止める）
import type { Actor } from "../actor"
import type { PermissionExtras } from "../catalog"
import type { Folder } from "../folders"
import type { MessageKey } from "../i18n/i18n"
import type { ItemPage } from "../placed"
import type { Book } from "../schema/book"
import type { ActionDef, Where } from "./action"
import type { SubjectDef } from "./subject"

// ページで問う（行う前）: ページ・アノテーションが対象のアクションを、宛先のページ page に行ってよいか。
// folders は、そのページを入れているフォルダの列（近い順。バインダが在ればバインダ、次にブック。フォルダの中身は id の並びで、ページの中身は入っていない）。
// where は、引数が名指す、ページの中の物の id（分からなければ無い）
export interface PagePermissionQuery {
  kind: "page"
  action: ActionDef
  page: ItemPage
  folders: readonly Folder[]
  where?: { ids: readonly string[] }
  actor: Actor // 問う者
}

// フォルダで問う（行う前）: ブックが対象・一覧が対象のアクションを、ブック folder に行ってよいか。folder はアクションが変えるブック（ページとバインダの中身ごと組んだ値）、
// where はその中の所（分からなければ無い）。一覧が対象のアクションは、変えるブックごとに問う。作るブックは、空のブックで問う（その id と名前は問うためだけの物で、頼らない）。
// ページ・アノテーションが対象のアクションも、宛先のページが分からないときは、開いているブックをこれで問う
export interface FolderPermissionQuery {
  kind: "folder"
  action: ActionDef
  folder: Book
  where?: Where
  actor: Actor
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

// 認可ステップが受ける問い。core がアクションの対象から kind を決めて渡し、ステップは受け取った kind で、自分が読む物だけを扱う
export type PermissionQuery = PagePermissionQuery | FolderPermissionQuery | RecordPermissionQuery

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
  // 足した・消した・変わった、ほかのブックかブックの外から入った（movedIn）・ほかのブックかブックの外へ出た（movedOut）。
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

export type PermissionCheck = FolderPermissionCheck | RecordPermissionCheck

export interface PermissionDef<Tt extends string = MessageKey> extends PermissionExtras {
  id: string
  title: Tt
  aiDescription: string // AI に断ったときに返す、何がなぜ止めたかの説明（英語）
  denies(q: PermissionQuery): boolean // 止めるか
  keeps?(c: PermissionCheck): boolean // 結果が許しを守っているか（無ければ守っている）
}
