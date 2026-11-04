// 物の名前: ブックの中の物の、画面に出す名前（伝言のバッジや鳥の名前など）。定義オブジェクトの拡張ポイントに書き足す labelOf から引く（labels.ts）。
// 画面に出す名前を読むフックは anchor-name.tsx
import type { ConnectorData, ShapeData } from "../../../core/def/item"
import type { ItemPage } from "../../../core/placed"

// 物の名前を返すメソッド（物の名前を出す所が引く。引くのは labels.ts）（定義オブジェクトの拡張ポイントに書き足す）。名前は本文と同じ書き方でよい（装飾は引く側が外す）。
// 引く側が id を持つ物を探して、その物の定義のメソッドだけを呼ぶ。名前が空なら、画面はその物の種類の名前で呼ぶ
declare module "../../../core/catalog" {
  interface BookTypeExtras {
    // ページ page の中の物 id の名前（形とつなぐものの中に無い物。ツリーの節など）
    labelOf?(page: ItemPage, id: string): string
  }
  interface ShapeItemExtras<D extends ShapeData = ShapeData> {
    // 置いた形 item そのもの（id が item.id）か、その中の物（中の形は除く。リストの行など）id の名前。書かなければ、形そのものはキャプション（captionProp）
    labelOf?(item: D, id: string): string
  }
  interface ConnectorItemExtras<D extends ConnectorData = ConnectorData> {
    // つないだ線など line の名前
    labelOf?(line: D): string
  }
}
