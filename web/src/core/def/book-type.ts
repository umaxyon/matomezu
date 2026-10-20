// ブックのタイプの定義: データの形・並べ方の決まり・使えるアイテムとアクションの規定・既定のテーマ。
// アイテム・アクション・テーマは id で参照する（アイテムとアクションはブックのタイプを知らない）
import type { z } from "zod"
import type { MessageKey } from "../i18n/i18n"
import type { PaperName } from "../paper"
import type { TokenDecl } from "./theme"

// 使えるものの規定。ブックは allowed の中から選び、選んでいなければ defaults を使う
export interface Choice {
  allowed: readonly string[]
  defaults: readonly string[]
}

export interface BookTypeDef {
  id: string // データの type の値
  version: number // データの形の版
  title: MessageKey // タイプの名前。題名を持たないブックは、この名前で呼ぶ
  schema: z.ZodObject // そのタイプのブックのデータの形（type は id の値）
  single: boolean // 1 冊だけのタイプか
  pages: boolean // ページを持つか（持つなら schema に pages がある）
  paper: PaperName | null // ページに置く紙（無ければ null）
  items: Choice
  actions: Choice
  theme: string // 既定のテーマ
  tokens: readonly TokenDecl[] // ブックの画面を描くのに使うテーマの欄
}

export function defineBookType<const T extends BookTypeDef>(def: T): T {
  return def
}
