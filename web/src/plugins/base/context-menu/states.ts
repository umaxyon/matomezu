// 右クリックのメニューのプラグイン状態の宣言: 右クリックで押した物のアンカーと、押した位置（メニューの置き場が窓で先に受けて覚える。pressed-anchor.tsx）
import type { Point } from "../../../core/geom"
import { kit } from "../kit"

// 右クリックで押した物のアンカーの id（アンカーの無い所なら無し）と、押した位置（画面の座標）
export interface PressedAnchor {
  anchor?: string
  at: Point
}

export const PRESSED_ANCHOR = kit.definePluginStateOf<PressedAnchor>()({ id: "pressed-anchor", scope: "window" })

export const CONTEXT_MENU_STATES = [PRESSED_ANCHOR] as const
