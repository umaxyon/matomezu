// ブックのタイプの定義: データの形・並べ方の決まり・使えるアイテムとアクションの規定・既定のテーマ。
// アイテム・アクション・テーマは id で参照する（アイテムとアクションはブックのタイプを知らない）
import { z } from "zod"
import type { ActionId, ItemOptionTable } from "../catalog"
import type { CoreCatalog } from "../core-catalog"
import type { MessageKey } from "../i18n/i18n"
import type { PaperRule } from "../paper"
import type { ToolSetId } from "../tools"
import type { TokenDecl } from "./theme"

// 使えるものの規定。ブックは allowed の中から選び、選んでいなければ defaults を使う
export interface Choice {
  allowed: readonly string[]
  defaults: readonly string[]
}

// タイプが選んだアイテムに渡す指定（アイテムの id → 指定。指定の形は、アイテムを作ったプラグインが ItemOptionTable に書き足して決める）
export type ItemOptions = { readonly [K in keyof ItemOptionTable]?: ItemOptionTable[K] }

// 使えるアイテムの規定と、アイテムへの指定（渡せるのは allowed のアイテムだけ）
export interface ItemChoice extends Choice {
  options?: ItemOptions
}

// タイプが足す・外すアクション
export interface ActionChoice {
  add?: readonly ActionId[]
  without?: readonly ActionId[]
}

// ページの決まり。addFromTabs はタブの横に、ページを足すボタン（page-add）を出すか。
// fields は、そのタイプのページが土台の欄のほかに持つ欄（ツリーの根など。土台の欄 id・title・paper・orientation・items・settings とは別の名前）
export interface PagesRule {
  paper: PaperRule
  addFromTabs: boolean
  fields?: Readonly<Record<string, z.ZodType>>
}

// 大きさが変わるときに保つ所。start は左（上）、center は真ん中
export type GrowFrom = "start" | "center"

// 新しいブックを作るときに渡すもの
export interface NewBook {
  id: string
  title: string
}

interface BookTypeBase<S extends z.ZodObject> {
  id: string // データの type の値
  version: number // データの形の版
  title: MessageKey // タイプの名前。題名を持たないブックは、この名前で呼ぶ
  // そのタイプのブックが自分で持つ欄の形（type は id の値。pluginKit で書くプラグインは type を書かず、kit が足す）。ページ（pages）と設定の項目の欄は書かず、機能台帳が選んだものから足す
  schema: S
  pages: PagesRule | null // ページを持つか（持つなら、機能台帳がページの欄を足す）
  items: ItemChoice
  // 使えるアクションは、タイプが選んだ物に付いて来る（アクションの attach）。add はそのタイプだけのアクション、without は使わせないアクション
  actions: ActionChoice
  theme: string // 既定のテーマ
  presentation: string // 見せ方（core/def/presentation.ts。描くビューは見せ方の id で結ぶ）
  tokens: readonly TokenDecl[] // ブックの画面を描くのに使うテーマキー
  tools?: ToolSetId // ステージで使う道具の組（core/tools.ts。無ければ道具を使わない）
  // データの形（schema）の外の決まり（線の端が同じページにあるかなど、アイテムどうしの関係）。守っていれば true。
  // アクションの結果と、残しておいたブックを読むときに確かめる（守っていなければ、アクションは断り、ブックは捨てる）
  holds?(book: z.infer<S>, catalog: CoreCatalog): boolean
  settings?: BookTypeSettings
  // 中身（キャプション）で形の大きさが変わるときに、横と縦で保つ所。setting はそのページで効いている設定の値（設定で変えてよい）。
  // 無ければ左と上を保つ
  growFrom?(setting: (id: string) => unknown): { x: GrowFrom; y: GrowFrom }
}

// ブックとページに持たせる設定の項目（設定の定義の id。core/def/setting.ts）。base のアクション book-update はブックの、page-update はページの項目を受け付ける
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

// schema に、データの type の欄（タイプの本当の id の文字）を足す（pluginKit の defineBookType が使う）
export type WithTypeField<S, Id extends string> =
  S extends z.ZodObject<infer Shape, infer Config>
    ? z.ZodObject<Omit<Shape, "type"> & { type: z.ZodLiteral<Id> }, Config>
    : never
export const withTypeField = <S extends z.ZodObject, const Id extends string>(
  schema: S,
  id: Id,
): WithTypeField<S, Id> => schema.extend({ type: z.literal(id) }) as unknown as WithTypeField<S, Id>
// schema に合うブックのデータの型（zod を読まない層が使う）
export type DataOf<S extends z.ZodType> = z.infer<S>
export type BookSchema = z.ZodObject
