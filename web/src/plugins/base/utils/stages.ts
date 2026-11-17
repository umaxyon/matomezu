// 窓のステージ: base のいくつもの機能（道具のアイコン・編集ロック）が読む、窓の全部のステージ
import type { Stage } from "../../../core/stage"
import type { WindowState } from "../../../core/window"

// 窓の全部のステージ（どのブックスクリーンのステージも。スクリーンを開いた順・左から）
export const allStages = (win: Pick<WindowState, "screens">): readonly Stage[] =>
  win.screens.flatMap(s => s.stages?.stages ?? [])
