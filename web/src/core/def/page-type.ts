// ページのタイプの定義: ページのデータの形・並べ方の決まり・使えるアイテムとアクションの規定・既定のテーマ。
// アイテム・アクション・テーマは id で参照する（アイテムとアクションはページのタイプを知らない）。ブックはタイプを持たず、タイプの違うページを並べる
import type { z } from "zod"
import type { ActionId, AnnotationId, ItemOptionTable, PageTypeExtras } from "../catalog"
import type { CoreCatalog } from "../core-catalog"
import type { MessageKey } from "../i18n/i18n"
import type { PaperRule } from "../paper"
import type { Page } from "../schema/page"
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

// タイプのダイアログ: ページを作るダイアログ（add。値を受けない）とページの設定のダイアログ（settings。PageSettingsArgs を受ける）の id で、タイプが自分のものにする。
// 無ければ、ページを受け持つプラグインの既定のダイアログを使う。受ける値が合うかは definePlugin が型で、あるかは台帳アセンブルが確かめる
export interface PageDialogs {
  add?: string
  settings?: string
}

// ページのまとまり方: none は 1 枚ずつ並びに入る。binder は、このタイプのページだけを入れるバインダにいつも入る（エントリ 1 つになるのはバインダ。スライド）
export type PageGrouping = "none" | "binder"

export interface PageTypeDef extends PageTypeExtras {
  id: string // ページのデータの type の値
  version: number // ページのデータの形の版
  title: MessageKey // タイプの名前
  paper: PaperRule
  // そのタイプのページが土台のフィールドのほかに持つフィールド（ツリーの根など。土台のフィールド kind・id・type・title・paper・orientation・grows・shift・locked・items・slide・settings と、バインダの lineup とは別の名前）
  fields?: Readonly<Record<string, z.ZodType>>
  dialogs?: PageDialogs
  grouping: PageGrouping
  items: ItemChoice
  // ページが持つ slide（items とは別の、形だけの並び）に置けるアイテム。形（shape）だけで、並べ方の決まりも線も使わない。無ければページは slide を持たない
  // background を書くと、slide はページの背景（items の下に敷き、背景編集モードで直す）。書かなければ slide がページの本体（スライド）
  slide?: { allowed: readonly string[]; background?: true }
  // 使えるアクションは、タイプが選んだ物に付いて来る（アクションの attach）。add はそのタイプだけのアクション、without は使わせないアクション
  actions: ActionChoice
  theme: string // 既定のテーマ
  presentation: string // 見せ方（core/def/presentation.ts。描くビューは見せ方の id で結ぶ）
  tokens: readonly TokenDef[] // ページの画面を描くのに使うテーマキー
  tools?: string // ステージで使う道具の組の id（core/def/tool.ts。無ければ道具を使わない）
  // データの形の外の決まり（アイテムどうしの関係）。守っていれば true。
  // アクションの結果と、残しておいたブックを読むときに確かめる（守っていなければ、アクションは断り、残しておいたブックのそのページは読めないページとして warning W029 にする。データは捨てない）
  holds?(page: Page, catalog: CoreCatalog): boolean
  // ページに持たせる設定の項目（holder が "page" の設定の定義の id。core/def/setting.ts）。base のアクション page-update が受け付ける
  settings?: readonly string[]
  // 使わせないアノテーションの種類の id（無ければ、どの種類も使える。core/def/annotation.ts）
  annotations?: { without?: readonly AnnotationId[] }
}

// タイプのページに置けるアイテムの id: ページの items の候補と、ページの slide に置くアイテム
export const placeableOf = (type: Pick<PageTypeDef, "items" | "slide">): readonly string[] => [
  ...type.items.allowed,
  ...(type.slide?.allowed ?? []),
]

// ページの slide が、そのタイプでは背景か（タイプが slide に background を書いていれば背景。書いていなければ、slide はページの本体）
export const slideIsBackground = (type: Pick<PageTypeDef, "slide">): boolean => type.slide?.background === true

// ステージが直している並び: ページの items か、ページの slide（背景のタイプでは背景。本体のタイプでは、いつも items のまま）
export type EditList = "items" | "slide"

export function definePageType<const T extends PageTypeDef>(def: T): T {
  return def
}
