// ex6 の連携ポイント: ex6 が形に答えてもらうメソッドを、定義オブジェクトの拡張ポイントに書き足す（型だけで、処理は持たない）。
// ex6 も、ex6 に答えるプラグイン（ex7）も、これを型だけ読む。名前は ex6 の id を頭に付けた "ex6:weight"
import type { ShapeData } from "matomezu"

declare module "matomezu/catalog" {
  interface ShapeItemExtras<D extends ShapeData = ShapeData> {
    "ex6:weight"?(item: D): number // 置いた形の重さ（0 以上）
  }
}
