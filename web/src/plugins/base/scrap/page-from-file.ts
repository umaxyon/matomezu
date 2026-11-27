// ファイルからページを作れるプレゼンテーション（ビューの定義の拡張ポイント pageFromFile）。外から落としたファイルをスクラップにして置くとき（file-drop.tsx）に、
// base がファイルをアセットの置き場に置き、プレゼンテーションが言うシステムフォルダの直下に、プレゼンテーションが言う形のページを作る（中身が同じページが在れば、作らずにそれを使う）
import type { AssetPut } from "../../../core/assets"
import type { ItemPage } from "../../../core/placed"

// 置き場に置けたアセット
export type PutAsset = Extract<AssetPut, { ok: true }>

// ファイルから作るページの形: 名前（名前の無いファイルでも空でない。重なれば base が番号を付ける）・向き・タイプのフィールド
export interface PageFromFile {
  title: string
  orientation: "portrait" | "landscape"
  fields: Readonly<Record<string, unknown>>
}

declare module "../../../core/catalog" {
  interface PresentationViewExtras {
    pageFromFile?: {
      type: string // 作るページのタイプ
      into: string // 作る所（システムフォルダの id。その直下に作る）
      accepts(type: string): boolean // 受けるファイルの種類（MIME の type）か
      refusal(reason: Extract<AssetPut, { ok: false }>["reason"]): MessageKey // 置き場が断った訳の文
      same(page: ItemPage, asset: PutAsset): boolean // 在るページ page が、置いたアセットと中身が同じページか
      // 作るページの形。text は文言を利用者の言語の文にする
      page(file: File, asset: PutAsset, text: (key: MessageKey) => string): PageFromFile
    }
  }
}
