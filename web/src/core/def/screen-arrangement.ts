// スクリーンアレンジメントの定義: 窓の、開いているスクリーンの見せ方（どれを・どこに・どの大きさで）。窓は、スクリーンアレンジメントを 1 つ持つ。
// 見えているスクリーン（描いているスクリーン。スクロールで画面の外にある物も含む）は、shown が、開いているスクリーンとカレントにした順だけから答える
// （画面を描かずに決まる。ホストと AI も、同じ関数で知る）。描き方は、プラグインの見た目で結ぶ（定義の id と同じ名前のスロットに置いたウィジェット）。
// スクリーンごとの高さなど、アレンジメントが持つ値は、プラグイン状態（スクリーンの範囲）で持つ
import type { ScreenArrangementExtras } from "../catalog"
import type { MessageKey } from "../i18n/i18n"
import type { OpenedScreen } from "../window"

export interface ScreenArrangementDef<Tt extends string = MessageKey> extends ScreenArrangementExtras {
  id: string // 本当の id（例: @matomezu/base:one-screen）
  title: Tt
  aiDescription: string // AI 向けの説明（英語。スクリーンをどう見せるか）
  // 見えているスクリーンの id。screens は開いているスクリーン（開いた順）、order はその id をカレントにした順（最後がカレントスクリーン）
  shown(screens: readonly OpenedScreen[], order: readonly string[]): readonly string[]
  atStart?: true // 窓を開いたときのスクリーンアレンジメント（機能台帳で 1 つだけが名乗る）
}
