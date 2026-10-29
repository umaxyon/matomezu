// 許可の定義: アクションを、ある所（ブック・ページ・アイテム）に対して行ってよいかを決める段。
// アクションを使えるかの問い合わせ（inspect の action）で、タイプの段の前に並ぶ。止めることはできても、許すことはしない（使えるかはタイプが決める）。
// 止めた段は問い合わせの答えの decidedBy に出るので、画面の各機能はそれを見て、薄くするか消すかなどを自分で決める。AI には断った段の aiDescription を返す。
// perform は行う前に denies を、行った後に keeps を確かめる（引数から分からない所を変えていても止める）
import type { PermissionExtras } from "../catalog"
import type { MessageKey } from "../i18n/i18n"
import type { Book } from "../schema/book"
import type { ActionContext, ActionDef } from "./action"

// どこに対して・誰が行うか。book はアクションが変えるブック、page と items はそのブックの中の所（分からなければ無い）
export interface PermissionQuery {
  action: ActionDef
  book: Book
  page?: string
  items?: readonly string[]
  by?: ActionContext["by"]
}

export interface PermissionDef<Tt extends string = MessageKey> extends PermissionExtras {
  id: string
  title: Tt
  aiDescription: string // AI に断ったときに返す、何がなぜ止めたかの説明（英語）
  denies(q: PermissionQuery): boolean // 止めるか
  // アクションの結果が、ブック before の許しを守っているか（after が無ければ、ブックは一覧から無くなった）。無ければ守っている
  keeps?(before: Book, after: Book | undefined, by: ActionContext["by"]): boolean
}
