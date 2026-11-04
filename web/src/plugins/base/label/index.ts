// 物の名前: ブックの中の物の、画面に出す名前（伝言のバッジや鳥の名前など）。定義オブジェクトの拡張ポイントに書き足す labelOf から引く（labels.ts）。
// 画面に出す名前を読むフックは anchor-name.tsx
import type { ConnectorData, ShapeData } from "../../../core/def/item"
import type { ItemPage } from "../../../core/placed"

// 物の名前を返すメソッド（物の名前を出す所が引く。引くのは labels.ts）（定義オブジェクトの拡張ポイントに書き足す）。名前は本文と同じ書き方でよい（装飾は引く側が外す）。
// 自分の物でなければ null、自分の物でも名前が無ければ空の文字列を返す（空なら、引く側は種類の名前を出す）
declare module "../../../core/catalog" {
  interface BookTypeExtras {
    // ページ page の中の物 id の名前（形として置いた物は、形の定義が受ける）
    labelOf?(page: ItemPage, id: string): string | null
  }
  interface ShapeItemExtras<D extends ShapeData = ShapeData> {
    // 置いた形 item そのもの（id が item.id）か、その中の物 id の名前。無ければ、形そのものはキャプション（captionProp）
    labelOf?(item: D, id: string): string | null
  }
  interface ConnectorItemExtras<D extends ConnectorData = ConnectorData> {
    // つないだ線など line の名前
    labelOf?(line: D): string | null
  }
}
