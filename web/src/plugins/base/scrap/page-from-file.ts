// ファイルからページを作れるプレゼンテーション（ビューの定義の拡張ポイント pageFromFile）。外から落としたファイルから、base がファイルをアセットの置き場に置き、
// プレゼンテーションが言う形のページを作る。図面・スライドに落としたとき（scrap/file-drop.tsx）は、言うシステムフォルダの直下に作り（中身が同じページが在れば、作らずにそれを使う）、
// そのスクラップを置く。書庫に落としたとき（library/file-drop.tsx）は、そのシステムフォルダとその下のフォルダだけが受け、落としたフォルダに作る
import type { AssetPut } from "../../../core/assets"
import type { MessageKey } from "../../../core/catalog"
import type { ItemPage } from "../../../core/placed"

// 置き場に置けたアセット
export type PutAsset = Extract<AssetPut, { ok: true }>

// ファイルから作るページの形: 名前（名前の無いファイルでも空でない。重なれば base が番号を付ける）・向き・タイプのフィールド
export interface PageFromFile {
  title: string
  orientation: "portrait" | "landscape"
  fields: Readonly<Record<string, unknown>>
}

// ファイルからページを作れるプレゼンテーションの宣言（ビューの定義の pageFromFile）
export interface PageFromFileDef {
  type: string // 作るページのタイプ
  into: string // 作る所と受ける所（システムフォルダの id。図面などに落とせばその直下に作り、書庫ではこのフォルダとその下が受ける）
  accepts(type: string): boolean // 受けるファイルの種類（MIME の type）か
  refusal(reason: Extract<AssetPut, { ok: false }>["reason"]): MessageKey // 置き場が断った訳の文
  same(page: ItemPage, asset: PutAsset): boolean // 在るページ page が、置いたアセットと中身が同じページか
  // 作るページの形。text は文言を利用者の言語の文にする
  page(file: File, asset: PutAsset, text: (key: MessageKey) => string): PageFromFile
}

declare module "../../../core/catalog" {
  interface PresentationViewExtras {
    pageFromFile?: PageFromFileDef
  }
}
