// 整えステップ: ブックが対象のアクションのあとに、どのブックにもかける整え（可変ページの中身を印刷区画の単位でずらすなど）。
// ビルトインプラグインだけが持つ（追加プラグインは definePlugin の型と組み立て E310 で止める）。perform が run のあとに並びの順にかける
import type { CoreCatalog } from "../core-catalog"
import type { Book } from "../schema/book"

export interface SettleStep {
  // このステップだけが書くページのフィールド。アクションの run が変えたら、perform は断る
  pageFields: readonly string[]
  // pageFields を変えてよいアクション（ブックを前の状態に戻すもの）の id
  restoring?: readonly string[]
  // アクションの前のブック before と run の結果 after から、整えたブック（変えなければ after）。整えられなければ null（perform は断る）
  settle(before: Book, after: Book, catalog: CoreCatalog): Book | null
}
