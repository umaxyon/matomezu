// 右クリックで押した物のアンカー: 物のビューがメニューを開くより先に、窓で先に（capture で）右クリックを受け、押した要素から外へたどって覚える。
// メニューの置き場は、開いたときにこれを読み、配置の anchorMenu のコマンドを出すかを決めて、その id を渡す（どのビューのメニューでも同じに読むため、メニューの target には入れない）。
// 右クリックの合図からでなく開いたメニュー（ほかの所で前に右クリックしたあと）が古いアンカーを読まないよう、押した位置も覚え、メニューの位置と同じときだけ使う
import type { Point } from "../../../core/geom"
import { anchorOf } from "../utils/anchors"

let pressed: { anchor: string | undefined; at: Point } | undefined
if (typeof window !== "undefined")
  window.addEventListener(
    "contextmenu",
    e => {
      pressed = { anchor: anchorOf(e.target instanceof Element ? e.target : null), at: { x: e.clientX, y: e.clientY } }
    },
    true,
  )

// 画面の点 at に開いたメニューの、右クリックで押した物のアンカーの id（アンカーの無い所か、その点で右クリックしていなければ undefined）
export const pressedAnchor = (at: Point): string | undefined =>
  pressed && pressed.at.x === at.x && pressed.at.y === at.y ? pressed.anchor : undefined
