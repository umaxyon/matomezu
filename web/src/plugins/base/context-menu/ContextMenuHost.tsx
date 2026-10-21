// 右クリックのメニューの置き場（ウィジェット menu-host）: store の開いているメニュー（contextMenu）を、押した位置に、
// 配置に書いたそのメニューのコマンドの並びで描く。出ていないコマンドは並べず、押せないものは押せない見た目にする。
// 外を押す・Escape・窓から離れると閉じ、項目を押すと閉じてから、右クリックされた物を渡してコマンドを呼ぶ
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { fitInside, type Point } from "../../../core/geom"
import type { OpenedContextMenu } from "../../../store/context-menus"
import { useCommand } from "../../../ui/commands"
import { useContextMenuItems } from "../../../ui/context-menu"
import { useT } from "../../../ui/i18n"
import type { ContextMenuCommandId } from "../../../ui/layout"
import { useActions, useApp, useUi } from "../../../ui/store-context"
import type { ContextMenuId } from "../../../ui/tables"
import styles from "./ContextMenuHost.module.css"

export function ContextMenuHost() {
  const menu = useApp(s => s.contextMenu)
  if (!menu) return null
  return <ContextMenu key={`${menu.id}:${menu.stage}:${menu.at.x}:${menu.at.y}`} menu={menu} />
}

function ContextMenu({ menu }: { menu: OpenedContextMenu }) {
  const { closeContextMenu } = useActions()
  const items = useContextMenuItems(menu.id as ContextMenuId)
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<Point>(menu.at)
  // 測った大きさで、窓からはみ出さない位置にする
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setAt(fitInside(menu.at, { w: r.width, h: r.height }, { w: window.innerWidth, h: window.innerHeight }))
  }, [menu.at])
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeContextMenu()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeContextMenu()
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    document.addEventListener("keydown", onKeyDown)
    window.addEventListener("blur", closeContextMenu)
    window.addEventListener("resize", closeContextMenu)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
      document.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("blur", closeContextMenu)
      window.removeEventListener("resize", closeContextMenu)
    }
  }, [closeContextMenu])
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus()
  }, [])
  return (
    <div
      ref={ref}
      className={styles.menu}
      role="menu"
      aria-label={t("Menu")}
      style={{ left: at.x, top: at.y }}
      onContextMenu={e => e.preventDefault()}
    >
      {items.map(id => (
        <ContextMenuItem key={id} menu={menu} id={id} />
      ))}
    </div>
  )
}

function ContextMenuItem({ menu, id }: { menu: OpenedContextMenu; id: ContextMenuCommandId<ContextMenuId> }) {
  const command = useCommand(menu.stage, id)
  const icon = useUi().commandIcons.get(id)
  const { closeContextMenu } = useActions()
  const t = useT()
  if (!command.shown) return null
  return (
    <button
      type="button"
      role="menuitem"
      className={styles.item}
      disabled={!command.enabled}
      onClick={() => {
        closeContextMenu()
        // 引数を取らないコマンドは、渡した物を使わない
        ;(command.run as (target?: unknown) => void)(menu.target)
      }}
    >
      {icon && <span className={styles.icon}>{icon}</span>}
      <span>{t(command.title)}</span>
    </button>
  )
}
