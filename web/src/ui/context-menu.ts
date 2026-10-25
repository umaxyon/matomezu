// 右クリックのメニュー: コンポーネントが右クリックを受けてメニューを開く口と、配置に書いたメニューの中身を読む口
import type { MouseEvent } from "react"
import { useShallow } from "zustand/react/shallow"
import type { ContextMenuId, ContextMenuTable } from "../core/catalog"
import { isShown } from "../store/commands"
import { type ContextMenuEntry, SEPARATOR, tidySeparators } from "./layout"
import { useActions, useApp, useDefs, useLayout } from "./store-context"

// 右ボタンの押し続け: ブラウザが右クリックを知らせるのは、Windows では離したとき、Mac・Linux では押したとき。
// 右ボタンを押している間に開こうとしたメニューは待たせ、離したときに開く（どの OS でも離したときに出る）。
// 長押しでほかのもの（道具のアイコンなど）を出したら suppressContextMenu を呼び、待たせていたメニューと、離したあとに届く右クリックを捨てる
const press = { held: false, pending: null as (() => void) | null, suppressed: false }
if (typeof window !== "undefined") {
  window.addEventListener(
    "pointerdown",
    e => {
      if (e.button !== 2 || e.pointerType !== "mouse") return
      Object.assign(press, { held: true, pending: null, suppressed: false })
    },
    true,
  )
  window.addEventListener("mouseup", e => {
    if (e.button !== 2 || !press.held) return
    const open = press.suppressed ? null : press.pending
    Object.assign(press, { held: false, pending: null })
    open?.()
  })
  window.addEventListener("blur", () => Object.assign(press, { held: false, pending: null }))
}

// 今の右ボタンの押し続けでは、右クリックのメニューを出さない（待たせていたものも、離したあとに届くものも）
export function suppressContextMenu(): void {
  Object.assign(press, { pending: null, suppressed: true })
}

// そのステージで、右クリックされた物 target のメニュー id を、押した位置に開く。ブラウザのメニューは出さない。
// 右ボタンを押している間なら、離したときに開く。開くコンポーネント（ウィジェットかブックのビュー）は、そのメニューを contextMenus に書く
export function useContextMenu<M extends ContextMenuId>(
  stage: string,
  id: M,
): (e: MouseEvent, target: ContextMenuTable[M]) => void {
  const { openContextMenu } = useActions()
  return (e, target) => {
    e.preventDefault()
    e.stopPropagation()
    if (press.suppressed) return
    const open = () => openContextMenu(stage, id, target, { x: e.clientX, y: e.clientY })
    if (press.held) press.pending = open
    else open()
  }
}

// 配置に書いたメニューの中身のうち、そのステージから見て出ているコマンドと区切り線（並びは配置の順。先頭・末尾・続けての区切り線は消す）
export function useContextMenuItems<M extends ContextMenuId>(stage: string, id: M): readonly ContextMenuEntry<M>[] {
  const menus = useLayout().contextMenus as { [K in ContextMenuId]?: readonly ContextMenuEntry<K>[] } | undefined
  const items = menus?.[id] ?? []
  const defs = useDefs()
  return useApp(useShallow(s => tidySeparators(items.filter(c => c === SEPARATOR || isShown(defs, s, stage, c)))))
}
