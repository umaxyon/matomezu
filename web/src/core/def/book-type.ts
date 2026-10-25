// ブックのタイプの定義: データの形・並べ方の決まり・使えるアイテムとアクションの規定・既定のテーマ。
// アイテム・アクション・テーマは id で参照する（アイテムとアクションはブックのタイプを知らない）
import type { z } from "zod"
import type { MessageKey } from "../i18n/i18n"
import type { PaperRule } from "../paper"
import type { Registry } from "../registry"
import type { ToolSetId } from "../tools"
import type { TokenDecl } from "./theme"

// 使えるものの規定。ブックは allowed の中から選び、選んでいなければ defaults を使う
export interface Choice {
  allowed: readonly string[]
  defaults: readonly string[]
}

// ページの決まり。addFromTabs はタブの横に、ページを足すボタン（page.add）を出すか
export interface PagesRule {
  paper: PaperRule
  addFromTabs: boolean
}

// 新しいブックを作るときに渡すもの
export interface NewBook {
  id: string
  title: string
}

interface BookTypeBase<S extends z.ZodObject> {
  id: string // データの type の値
  version: number // データの形の版
  title: MessageKey // タイプの名前。題名を持たないブックは、この名前で呼ぶ
  // そのタイプのブックが自分で持つ欄の形（type は id の値）。ページ（pages）と設定の項目の欄は書かず、登録表が選んだものから足す
  schema: S
  pages: PagesRule | null // ページを持つか（持つなら、登録表がページの欄を足す）
  items: Choice
  actions: Choice
  theme: string // 既定のテーマ
  presentation: string // 見せ方（core/def/presentation.ts。描くビューは見せ方の id で結ぶ）
  tokens: readonly TokenDecl[] // ブックの画面を描くのに使うテーマの欄
  tools?: ToolSetId // ステージで使う道具の組（core/tools.ts。無ければ道具を使わない）
  // データの形（schema）の外の決まり（線の端が同じページにあるかなど、アイテムどうしの関係）。守っていれば true。
  // アクションの結果と、残しておいたブックを読むときに確かめる（守っていなければ、アクションは断り、ブックは捨てる）
  holds?(book: z.infer<S>, reg: Registry): boolean
  settings?: BookTypeSettings
}

// ブックとページに持たせる設定の項目（設定の定義の id。core/def/setting.ts）。base のアクション book.update はブックの、page.update はページの項目を受け付ける
export interface BookTypeSettings {
  book?: readonly string[]
  page?: readonly string[]
}

// 1 冊だけのタイプ（マスターなど）。作る操作は無く、その 1 冊のデータを定義に持つ（id はタイプの id）。
// インスタンスは表にある 1 冊だけのタイプのブックを、いつも持つ
export interface SingleBookTypeDef<S extends z.ZodObject = z.ZodObject> extends BookTypeBase<S> {
  single: true
  book: z.infer<S>
}

// 何冊も作れるタイプ。create は空のブックを作る
export interface ManyBookTypeDef<S extends z.ZodObject = z.ZodObject> extends BookTypeBase<S> {
  single: false
  create(init: NewBook): z.infer<S>
}

export type BookTypeDef<S extends z.ZodObject = z.ZodObject> = SingleBookTypeDef<S> | ManyBookTypeDef<S>

// create の返す値を、schema の形に合わせる（id などは書いた文字のまま残す）
export function defineBookType<const S extends z.ZodObject, const T extends BookTypeDef<S>>(def: T & { schema: S }): T {
  return def
}
