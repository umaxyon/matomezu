// 描いたレイヤーの外（ステージなど）へ操作の知らせを渡さない箱の受け口（スタンドと角の押す物の箱）。
// React の知らせは描いたレイヤーの木を上るので、箱で止めないと、下の物を押したのと同じになる。
// 右クリックは画面の根まで届かないので、ブラウザのメニューもここで止める（テキストFormの中は止めない）
import type { SyntheticEvent } from "react"
import { stopBrowserMenu } from "../../../ui/context-menu"

const stop = (e: SyntheticEvent) => e.stopPropagation()

export const KEEP_INSIDE = {
  onPointerDown: stop,
  onClick: stop,
  onDoubleClick: stop,
  onContextMenu: (e: SyntheticEvent<Element, MouseEvent>) => {
    stop(e)
    stopBrowserMenu(e)
  },
  onWheel: stop,
  onKeyDown: stop,
}
