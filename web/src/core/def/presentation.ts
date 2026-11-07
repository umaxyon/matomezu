// 見せ方の定義: ブックをステージにどう見せ、どう触るか（紙の上に形を置く・一覧にするなど）。ブックのタイプが id で選ぶ。
// 描くビューは、見た目を結ぶとき（ui/plugin.ts の presentationViews）にこの id で結ぶ。
// keyScope は、カレントのステージがこの見せ方で描いている間、ステージの範囲より先に探すキーの範囲（押した所の要素によらない）。
// paper が false なら、ステージに紙を置かない（ページが紙を持っていても。紙で決まるずらす・倍率・紙のコマンドは使わず、ビューが自分で描く広さとスクロールを持つ）。
// seen は、ページ page の物 item（最上位のアイテムか、その中の子の形の id）が、紙の上の四角 shown（ステージの表示領域）の中に見えているか。
// 土台は、AI とほかの窓のまだ見ていない変更の物が見えたら、画面の履歴に差し込む（前と後のページで聞き、消えた物は前の場所で答える）。
// 無ければ、開いているページの変更は見えたとする
import type { KeyScopeId, PresentationExtras } from "../catalog"
import type { CoreCatalog } from "../core-catalog"
import type { Rect } from "../geom"
import type { Page } from "../schema/book"

export interface PresentationDef extends PresentationExtras {
  id: string
  keyScope?: KeyScopeId
  paper?: false
  seen?(catalog: CoreCatalog, page: Page, item: string, shown: Rect): boolean
}

export function definePresentation<const Id extends string>(
  def: PresentationDef & { id: Id },
): PresentationDef & { id: Id } {
  return def
}
