// ノーマライズステップ: アクションのあとに、変わり得たページ 1 枚ずつにかける整え（可変ページの中身を印刷区画の単位でずらすなど）。
// ブックの中のページにも、ブックの外のページにも、同じ形でかける（ページの外の物は読まない）。
// ビルトインプラグインだけが持つ（追加プラグインは definePlugin の型と台帳アセンブル E310 で止める）。perform が run のあとに並びの順にかける
import type { NO_PAGE } from "../book"
import type { CoreCatalog } from "../core-catalog"
import type { ItemPage } from "../placed"

export interface NormalizeStepDef {
  // このステップだけが書くページのフィールド。アクションの run が変えたら、perform は断る
  pageFields: readonly string[]
  // pageFields を変えてよいアクション（ブックを前の状態に戻すもの）の id
  restoring?: readonly string[]
  // アクションの前のページ before（アクションが作ったページなら NO_PAGE）と run の結果のページ after から、整えたページ（変えなければ after）。
  // 整えられなければ null（perform は断る）
  normalize(before: ItemPage | typeof NO_PAGE, after: ItemPage, catalog: CoreCatalog): ItemPage | null
}
