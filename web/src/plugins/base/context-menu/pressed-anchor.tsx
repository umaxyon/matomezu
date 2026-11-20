// 右クリックで押した物のアンカー: 物のビューがメニューを開くより先に、窓で先に（capture で）右クリックを受け、押した要素から外へたどって、窓の範囲のプラグイン状態 pressed-anchor に覚える。
// メニューの置き場は、開いたときにこれを読み、UI マッピングの anchorMenu のコマンドを出すかを決めて、その id を渡す（どのビューのメニューでも同じに読むため、メニューの target には入れない）。
// 右クリックの合図からでなく開いたメニュー（ほかの所で前に右クリックしたあと）が古いアンカーを読まないよう、押した位置も覚え、メニューの位置と同じときだけ使う
import { useEffect } from "react"
import type { Point } from "../../../core/geom"
import { useSetPluginState } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { anchorOf } from "../stand/anchors"
import { PRESSED_ANCHOR, type PressedAnchor } from "./states"

// 窓の右クリックを先に受けて、押した物のアンカーと位置を覚える（置き場のウィジェットが描いている間）
export function useRememberPressedAnchor() {
  const set = useSetPluginState(kit, PRESSED_ANCHOR)
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const anchor = anchorOf(e.target instanceof Element ? e.target : null)
      set({ ...(anchor === undefined ? {} : { anchor }), at: { x: e.clientX, y: e.clientY } })
    }
    window.addEventListener("contextmenu", onContextMenu, true)
    return () => window.removeEventListener("contextmenu", onContextMenu, true)
  }, [set])
}

// 画面の点 at に開いたメニューの、覚えた右クリック pressed で押した物のアンカーの id（アンカーの無い所か、その点で右クリックしていなければ undefined）
export const pressedAnchorAt = (pressed: PressedAnchor | undefined, at: Point): string | undefined =>
  pressed && pressed.at.x === at.x && pressed.at.y === at.y ? pressed.anchor : undefined
