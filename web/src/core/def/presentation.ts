// 見せ方の定義: ブックをステージにどう見せ、どう触るか（紙の上に形を置く・一覧にするなど）。ブックのタイプが id で選ぶ。
// 描くビューは、見た目を結ぶとき（ui/plugin.ts の presentationViews）にこの id で結ぶ。
// keyScope は、カレントのステージがこの見せ方で描いている間、ステージの範囲より先に探すキーの範囲（押した所の要素によらない）。
// paper が false なら、ステージに紙を置かない（ページが紙を持っていても。紙で決まるずらす・倍率・紙のコマンドは使わず、ビューが自分で描く広さとスクロールを持つ）
import type { KeyScopeId, PresentationExtras } from "../catalog"

export interface PresentationDef extends PresentationExtras {
  id: string
  keyScope?: KeyScopeId
  paper?: false
}

export function definePresentation<const Id extends string>(
  def: PresentationDef & { id: Id },
): PresentationDef & { id: Id } {
  return def
}
