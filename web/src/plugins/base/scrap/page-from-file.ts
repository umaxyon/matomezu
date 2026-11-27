// ファイルからページを作れるプレゼンテーション（ビューの定義の拡張ポイント pageFromFile）と、作るときに使える物。
// 外から落としたファイルをスクラップにして置くとき（file-drop.tsx）に、ページを作る
import type { AssetPut } from "../../../core/assets"
import type { MessageKey } from "../../../core/catalog"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { Folders } from "../../../core/folders"
import type { ArgsOf } from "../../../core/perform"
import type { ItemPage } from "../../../core/placed"
import type { PAGE_ADD } from "../pages/page-add"

// ファイルからページを作るときに使える物（プレゼンテーションの pageFromFile の make が受ける）
export interface PageFromFileUse {
  catalog: CoreCatalog
  folders: Folders
  // 書庫の、開けるページ（ゴミ箱の外）の表から、合う物の id（無ければ null）
  findPage(match: (page: ItemPage) => boolean): string | null
  // ファイルの中身をアセットの置き場に置く
  putAsset(bytes: Blob): Promise<AssetPut>
  // フォルダ folder にページを作る（名前が重なれば、聞かずに番号を付ける）。作ったページの id。断られたら、訳をトーストで知らせて null
  createPage(folder: string, args: ArgsOf<typeof PAGE_ADD.id> & { title: string }): string | null
  // 作れないファイルの訳をトーストで知らせる
  refuse(file: string, why: MessageKey): void
  // 文言を、利用者の言語の文にする
  text(key: MessageKey, params?: Readonly<Record<string, string>>): string
}

declare module "../../../core/catalog" {
  interface PresentationViewExtras {
    // ファイルから、このプレゼンテーションのページを作れるプレゼンテーション: 受けるファイルの種類（MIME の type）か、と、作る関数（作ったか、在った物を使うページの id。
    // 作れなければ use.refuse で訳を知らせて null）。名前の無いファイル（貼り付け）は、作る側が名前を決める
    pageFromFile?: {
      accepts(type: string): boolean
      make(file: File, use: PageFromFileUse): Promise<string | null>
    }
  }
}
