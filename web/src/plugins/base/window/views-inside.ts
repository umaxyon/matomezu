// スクリーンの定義の viewsInside（base が拡張ポイントに書き足したフィールド）: 中に base のスクリーンが見せる画面の物（郵便箱の画面・書庫の画面など）を描くスクリーンが、
// その base のスクリーンの定義の id ごとに、その画面を出す自分のプラグイン状態（画面の場所に入れる宣言）の id と値を名乗る。
// 書いたスクリーンからその base のスクリーンを開くと、新しく開かずに、開く側のフックがその宣言に値を入れ、開くコマンドはそのスクリーンの中の画面に対して行う
// ほかのスクリーンからその base のスクリーンを新しく開くとき、宣言の値が中に描く値なら、開く側のフックが同じ同期の処理の中で away の値に替える（ブラウザの履歴は 1 つ）
import type { ScreenId } from "../../../core/catalog"
import type { CoreCatalog } from "../../../core/core-catalog"

export interface ViewInside {
  readonly state: string // 画面の場所に入れるプラグイン状態の宣言の id（スクリーンの持ち主の物）
  readonly value: unknown // その画面を出すときの値
  // その base のスクリーンを新しく開くとき（中に描いていないスクリーンから開くとき）、中の画面をほかの画面に替える値（無ければ替えない）。
  // 開く側のフックが、宣言の値が value なら、新しく開くのと同じ同期の処理の中で入れる（ブラウザの履歴は 1 つ）
  readonly away?: unknown
}

declare module "../../../core/catalog" {
  interface ScreenExtras {
    viewsInside?: { readonly [def in ScreenId]?: ViewInside }
  }
}

// 定義 screenDef のスクリーンが、base のスクリーンの定義 def の画面を中に描いているなら、それを出す宣言と値（描いていなければ undefined）
export const viewInsideOf = (
  catalog: Pick<CoreCatalog, "screens">,
  screenDef: string,
  def: ScreenId,
): ViewInside | undefined => catalog.screens.get(screenDef)?.viewsInside?.[def]
