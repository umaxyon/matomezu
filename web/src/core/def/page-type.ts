// ブックのタイプの定義: データの形・並べ方の決まり・使えるアイテムとアクションの規定・既定のテーマ。
// アイテム・アクション・テーマは id で参照する（アイテムとアクションはブックのタイプを知らない）
import { z } from "zod"
import type { ActionId, AnnotationId, ItemOptionTable, PageTypeExtras } from "../catalog"
import type { CoreCatalog } from "../core-catalog"
import type { MessageKey } from "../i18n/i18n"
import type { PaperRule } from "../paper"
import type { TokenDef } from "./theme"

// タイプが選んだアイテムに渡す指定（アイテムの id → 指定。指定の形は、アイテムを作ったプラグインが ItemOptionTable に書き足して決める）
export type ItemOptions = { readonly [K in keyof ItemOptionTable]?: ItemOptionTable[K] }

// 使えるアイテム（allowed。データに置け、画面からも AI からも置ける物）と、アイテムへの指定（渡せるのは allowed のアイテムだけ）
export interface ItemChoice {
  allowed: readonly string[]
  options?: ItemOptions
}

// タイプが足す・外すアクション
export interface ActionChoice {
  add?: readonly ActionId[]
  without?: readonly ActionId[]
}

// ページの決まり。
// fields は、そのタイプのページが土台のフィールドのほかに持つフィールド（ツリーの根など。土台のフィールド id・title・paper・orientation・grows・shift・locked・items・settings とは別の名前）。
// dialogs は、ページを作るダイアログ（add。値を受けない）とページの設定のダイアログ（settings。PageSettingsArgs を受ける）の id で、タイプが自分のものにする。
// 無ければ、ページを受け持つプラグインの既定のダイアログを使う。受ける値が合うかは definePlugin が型で、あるかは台帳アセンブルが確かめる
export interface PagesRule {
  paper: PaperRule
  fields?: Readonly<Record<string, z.ZodType>>
  dialogs?: { add?: string; settings?: string }
}

// 新しいブックを作るときに渡すもの
export interface NewBook {
  id: string
  title: string
}

export interface PageTypeDef<S extends z.ZodObject = z.ZodObject> extends PageTypeExtras {
  id: string // データの type の値
  version: number // データの形の版
  title: MessageKey // タイプの名前。題名を持たないブックは、この名前で呼ぶ
  // そのタイプのブックが自分で持つフィールドの形（type は id の値。pluginKit で書くプラグインは type を書かず、kit が足す）。ページ（pages）と設定の項目のフィールドは書かず、機能台帳が選んだものから足す
  schema: S
  pages: PagesRule | null // ページを持つか（持つなら、機能台帳がページのフィールドを足す）
  items: ItemChoice
  // ページが持つ slide（items とは別の、形だけの並び）に置けるアイテム。形（shape）だけで、並べ方の決まりも線も使わない。無ければページは slide を持たない
  // background を書くと、slide はページの背景（items の下に敷き、背景編集モードで直す）。書かなければ slide がページの本体（スライドのブック）
  slide?: { allowed: readonly string[]; background?: true }
  // 使えるアクションは、タイプが選んだ物に付いて来る（アクションの attach）。add はそのタイプだけのアクション、without は使わせないアクション
  actions: ActionChoice
  theme: string // 既定のテーマ
  presentation: string // 見せ方（core/def/presentation.ts。描くビューは見せ方の id で結ぶ）
  tokens: readonly TokenDef[] // ブックの画面を描くのに使うテーマキー
  tools?: string // ステージで使う道具の組の id（core/def/tool.ts。無ければ道具を使わない）
  // データの形（schema）の外の決まり（線の端が同じページにあるかなど、アイテムどうしの関係）。守っていれば true。
  // アクションの結果と、残しておいたブックを読むときに確かめる（守っていなければ、アクションは断り、残しておいたブックは読めないとして warning W006 にする。データは捨てない）
  holds?(book: z.infer<S>, catalog: CoreCatalog): boolean
  settings?: PageTypeSettings
  create(init: NewBook): z.infer<S> // 空のブックを作る
  // 使わせないアノテーションの種類の id（無ければ、どの種類も使える。core/def/annotation.ts）
  annotations?: { without?: readonly AnnotationId[] }
}

// ブックとページに持たせる設定の項目（設定の定義の id。core/def/setting.ts）。base のアクション book-update はブックの、page-update はページの項目を受け付ける
export interface PageTypeSettings {
  book?: readonly string[]
  page?: readonly string[]
}

// タイプのブックに置けるアイテムの id: ブックの items の候補と、ページの slide に置くアイテム
export const placeableOf = (type: Pick<PageTypeDef, "items" | "slide">): readonly string[] => [
  ...type.items.allowed,
  ...(type.slide?.allowed ?? []),
]

// ページの slide が、そのタイプでは背景か（タイプが slide に background を書いていれば背景。書いていなければ、slide はページの本体）
export const slideIsBackground = (type: Pick<PageTypeDef, "slide">): boolean => type.slide?.background === true

// ステージが直している並び: ページの items か、ページの slide（背景のタイプでは背景。本体のタイプでは、いつも items のまま）
export type EditList = "items" | "slide"

// create の返す値を、schema の形に合わせる（id などは書いた文字のまま残す）
export function definePageType<const S extends z.ZodObject, const T extends PageTypeDef<S>>(def: T & { schema: S }): T {
  return def
}

// schema に、データの type のフィールド（タイプの本当の id の文字）を足す（pluginKit の definePageType が使う）
export type WithTypeField<S, Id extends string> =
  S extends z.ZodObject<infer Shape, infer Config>
    ? z.ZodObject<Omit<Shape, "type"> & { type: z.ZodLiteral<Id> }, Config>
    : never
export const withTypeField = <S extends z.ZodObject, const Id extends string>(
  schema: S,
  id: Id,
): WithTypeField<S, Id> => schema.extend({ type: z.literal(id) }) as unknown as WithTypeField<S, Id>
// schema に合うブックのデータの型（zod を読まないクレートが使う）
export type DataOf<S extends z.ZodType> = z.infer<S>
export type BookSchema = z.ZodObject
