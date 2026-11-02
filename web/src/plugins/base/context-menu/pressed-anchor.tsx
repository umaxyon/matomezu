// 右クリックで押した物のアンカー: 物のビューがメニューを開くより先に、窓で先に（capture で）右クリックを受け、押した要素から外へたどって覚える。
// メニューの置き場は、開いたときにこれを読み、配置の anchorMenu のコマンドを出すかを決めて、その id を渡す（どのビューのメニューでも同じに読むため、メニューの target には入れない）
import { anchorOf } from "../utils/anchors"

let pressed: string | undefined
if (typeof window !== "undefined")
  window.addEventListener(
    "contextmenu",
    e => {
      pressed = anchorOf(e.target instanceof Element ? e.target : null)
    },
    true,
  )

// 最後に右クリックで押した物のアンカーの id（アンカーの無い所なら undefined）
export const pressedAnchor = (): string | undefined => pressed
