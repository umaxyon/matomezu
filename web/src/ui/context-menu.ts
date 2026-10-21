// 右クリックのメニュー: 部品が右クリックを受けてメニューを開く口と、配置に書いたメニューの中身を読む口
import type { MouseEvent } from "react"
import { useShallow } from "zustand/react/shallow"
import { isShown } from "../store/commands"
import { type ContextMenuEntry, SEPARATOR, tidySeparators } from "./layout"
import { useActions, useApp, useDefs, useLayout } from "./store-context"
import type { ContextMenuId, ContextMenuTable } from "./tables"

// そのステージで、右クリックされた物 target のメニュー id を、押した位置に開く。ブラウザのメニューは出さない。
// 開く部品（ウィジェットかブックのビュー）は、そのメニューを contextMenus に書く
export function useContextMenu<M extends ContextMenuId>(
  stage: string,
  id: M,
): (e: MouseEvent, target: ContextMenuTable[M]) => void {
  const { openContextMenu } = useActions()
  return (e, target) => {
    e.preventDefault()
    e.stopPropagation()
    openContextMenu(stage, id, target, { x: e.clientX, y: e.clientY })
  }
}

// 配置に書いたメニューの中身のうち、そのステージから見て出ているコマンドと区切り線（並びは配置の順。先頭・末尾・続けての区切り線は消す）
export function useContextMenuItems<M extends ContextMenuId>(stage: string, id: M): readonly ContextMenuEntry<M>[] {
  const menus = useLayout().contextMenus as { [K in ContextMenuId]?: readonly ContextMenuEntry<K>[] } | undefined
  const items = menus?.[id] ?? []
  const defs = useDefs()
  return useApp(useShallow(s => tidySeparators(items.filter(c => c === SEPARATOR || isShown(defs, s, stage, c)))))
}
