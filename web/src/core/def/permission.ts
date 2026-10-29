// 認可ステップの定義: アクションを、ある所（ブック・ページ・アイテム）に対して行ってよいかを決めるステップ。
// アクションを使えるかの問い合わせ（inspect の action）で、タイプのステップの前に並ぶ。止めることはできても、許すことはしない（使えるかはタイプが決める）。
// 止めたステップは問い合わせの答えの decidedBy に出るので、画面の各機能はそれを見て、薄くするか消すかなどを自分で決める。AI には断ったステップの aiDescription を返す。
// 行う前の denies は見せ方のための判断で、守るのは行った後の keeps（行う前に分からなかった所を変えていても、実際の変化で止める）
import type { PermissionExtras } from "../catalog"
import type { MessageKey } from "../i18n/i18n"
import type { Book } from "../schema/book"
import type { ActionContext, ActionDef, Where } from "./action"

// 行う前の問い: どこに対して・誰が行うか。book はアクションが変えるブック、where はその中の所（分からなければ無い）
export interface PermissionQuery {
  action: ActionDef
  book: Book
  where?: Where
  by?: ActionContext["by"]
}

// 行う前と後のブックの変化（core が比べて求める）
export interface Changes {
  gone: boolean // ブックが一覧から無くなった
  fields: readonly string[] // 変わったブックのフィールド（pages を除く）
  pages: readonly PageChange[] // 足した・消した・変わったページ
}

export interface PageChange {
  id: string
  change: "added" | "removed" | "changed"
  fields: readonly string[] // 変わったページのフィールド（items を除く。足した・消したページは空）
  items: readonly string[] // 足した・消した・変わったアイテム（ページに直に置いたもの。子の形の変化は、それを持つアイテムの変化）
}

// 行った後の確かめ: アクション action の前のブック before、後のブック after（無ければ一覧から無くなった）と、その変化
export interface PermissionCheck {
  action: ActionDef
  before: Book
  after: Book | undefined
  changes: Changes
  by?: ActionContext["by"]
}

export interface PermissionDef<Tt extends string = MessageKey> extends PermissionExtras {
  id: string
  title: Tt
  aiDescription: string // AI に断ったときに返す、何がなぜ止めたかの説明（英語）
  denies(q: PermissionQuery): boolean // 止めるか
  keeps?(c: PermissionCheck): boolean // 結果が許しを守っているか（無ければ守っている）
}
