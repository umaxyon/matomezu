// 右クリックのメニュー: コンポーネントが右クリックを受けてメニューを開く口と、UI マッピングに書いたメニューの中身を読む口

import type { MouseEvent } from "react"
import { useShallow } from "zustand/react/shallow"
import type { ContextMenuId, ContextMenuTable } from "../core/catalog"
import { isShown } from "../store/commands"
import { type AnchorMenuCommandId, type ContextMenuEntry, SEPARATOR, tidySeparators } from "./layout"
import { useAt } from "./scope"
import { useInstance, useLayout, useMatomezuState, useStoreActions } from "./store-context"

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

// 右クリック e のブラウザのメニューを止める（テキストFormの中は止めない）。画面の根と、知らせを外へ渡さない所（スタンドなど）が呼ぶ
export const stopBrowserMenu = (e: Pick<MouseEvent, "target" | "preventDefault">): void => {
  if (!(e.target instanceof Element && e.target.closest("input, textarea, [contenteditable]"))) e.preventDefault()
}

// 今の右ボタンの押し続けでは、右クリックのメニューを出さない（待たせていたものも、離したあとに届くものも）
export function suppressContextMenu(): void {
  Object.assign(press, { pending: null, suppressed: true })
}

// 向け先のステージで、右クリックされた物 target のメニュー id を、押した位置に開く。ブラウザのメニューは出さない。
// 右ボタンを押している間なら、離したときに開く。開くコンポーネント（ウィジェットかブックのビュー）は、そのメニューを contextMenus に書く。
// 向け先が無い所（ステージの外で見るだけに描くページの中）では、開かない（右クリックは外へ渡す）
export function useContextMenu<M extends ContextMenuId>(
  id: M,
): (
  e: Pick<MouseEvent, "preventDefault" | "stopPropagation" | "clientX" | "clientY">,
  target: ContextMenuTable[M],
) => void {
  const at = useAt()
  const open = useOpenContextMenu()
  return (e, target) => {
    if (at !== null) open(e, at, id, target)
  }
}

// 右クリック e で、ステージ stage にメニュー id を開く口（useContextMenu と同じ。開くステージが、右クリックを受けたときに決まる所で使う）
export function useOpenContextMenu(): <M extends ContextMenuId>(
  e: Pick<MouseEvent, "preventDefault" | "stopPropagation" | "clientX" | "clientY">,
  stage: string,
  id: M,
  target: ContextMenuTable[M],
) => void {
  const { openContextMenu } = useStoreActions()
  return (e, stage, id, target) => {
    e.preventDefault()
    e.stopPropagation()
    if (press.suppressed) return
    const open = () => openContextMenu(stage, id, target, { x: e.clientX, y: e.clientY })
    if (press.held) press.pending = open
    else open()
  }
}

// UI マッピングに書いたメニューの中身のうち、そのステージから見て出ているコマンドと区切り線（並びは UI マッピングの順。先頭・末尾・続けての区切り線は消す）
export function useContextMenuItems<M extends ContextMenuId>(stage: string, id: M): readonly ContextMenuEntry<M>[] {
  const menus = useLayout().contextMenus as { [K in ContextMenuId]?: readonly ContextMenuEntry<K>[] } | undefined
  const items = menus?.[id] ?? []
  const defs = useInstance()
  return useMatomezuState(
    useShallow(s => tidySeparators(items.filter(c => c === SEPARATOR || isShown(defs, s, stage, c)))),
  )
}

// UI マッピングの anchorMenu（押した物にアンカーがあるとき、どの右クリックのメニューにも足すコマンド）のうち、そのステージから見て出ているもの（並びは UI マッピングの順）
export function useAnchorMenuItems(stage: string): readonly AnchorMenuCommandId[] {
  const items = useLayout().anchorMenu ?? []
  const defs = useInstance()
  return useMatomezuState(useShallow(s => items.filter(c => isShown(defs, s, stage, c))))
}
