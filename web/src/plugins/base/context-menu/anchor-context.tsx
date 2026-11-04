// アンカーだけの右クリックのメニュー: アンカーを付けた物のビューが自分でメニューを開かなかったとき（追加プラグインの物など）、
// 窓で右クリックを受けて、配置の anchorMenu のコマンドだけのメニューを開く（伝言・マークをどの物にも付けられるように）。
// テキストFormの中と、ステージの外では開かず、ブラウザのメニューのままにする
import { useEffect } from "react"
import { useOpenContextMenu } from "../../../ui/context-menu"
import { kit } from "../kit"
import { anchorOf } from "../utils/anchors"

export const ANCHOR_CONTEXT = kit.name("anchor-context")

const EDITABLE = "input, textarea, [contenteditable]:not([contenteditable='false'])"

// 窓まで届いた右クリック e で、アンカーだけのメニューを開くステージ（開かないなら null）: ほかのメニューが開いておらず、
// テキストFormの外で、ステージの中のアンカーの付いた物を押したとき
export function anchorContextStage(e: Pick<MouseEvent, "defaultPrevented" | "target">): string | null {
  const target = e.target
  if (e.defaultPrevented || !(target instanceof Element) || target.closest(EDITABLE)) return null
  const stage = target.closest("[data-stage]")?.getAttribute("data-stage")
  return stage && anchorOf(target) !== undefined ? stage : null
}

// 窓の右クリックを受けて、どのメニューも開いていなければ、アンカーだけのメニューを開く（置き場のウィジェットが描いている間）
export function useAnchorContextMenu() {
  const open = useOpenContextMenu()
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const stage = anchorContextStage(e)
      if (stage) open(e, stage, ANCHOR_CONTEXT, {})
    }
    window.addEventListener("contextmenu", onContextMenu)
    return () => window.removeEventListener("contextmenu", onContextMenu)
  }, [open])
}

declare module "../../../core/catalog" {
  interface ContextMenuTable {
    "@matomezu/base:anchor-context": Record<string, never> // アンカーの付いた物（anchorMenu のコマンドだけを出す。何も受け取らない）
  }
}
