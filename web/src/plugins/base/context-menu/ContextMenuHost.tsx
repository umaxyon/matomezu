// 右クリックのメニューの置き場（ウィジェット menu-host）: store の開いているメニュー（contextMenu）を、押した位置に、
// UI マッピングに書いたそのメニューのコマンドの並びで描く（区切り線も）。出ていないコマンドは並べず、押せないものは押せない見た目にする。出るコマンドが無ければ閉じる。
// 外を押す・閉じるキー（キーバインドの menu-close。既定は Escape）・窓の大きさが変わると閉じ（窓から離れただけでは閉じない）、
// 項目を押すと閉じてから、右クリックされた物を渡してコマンドを呼ぶ。項目の横には、そのコマンドのキーを添える。
// 中の項目の描いている場所は、メニューを開いた場所（ui/scope.tsx）。
// 押した物にアンカーが付いていれば、どのメニューにも、区切り線のあとに UI マッピングの anchorMenu のコマンドを足し、押した物のアンカーの id を渡す
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { ContextMenuId } from "../../../core/catalog"
import type { Point } from "../../../core/geom"
import type { OpenedContextMenu } from "../../../store/context-menus"
import { openedAt } from "../../../store/dialogs"
import { useCommand } from "../../../ui/commands"
import { useAnchorMenuItems, useContextMenuItems } from "../../../ui/context-menu"
import { useMessages } from "../../../ui/i18n"
import { useKeyLabel } from "../../../ui/keys"
import { type AnchorMenuCommandId, type ContextMenuCommandId, SEPARATOR } from "../../../ui/layout"
import type { ContextMenuRow } from "../../../ui/plugin"
import { ActsOnScope } from "../../../ui/scope"
import { useMatomezuState, useStoreActions, useUiCatalog } from "../../../ui/store-context"
import { useReadPluginState } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { useAnchorContextMenu } from "./anchor-context"
import styles from "./ContextMenuHost.module.css"
import { fitInside } from "./fit"
import { MenuRow } from "./MenuRow"
import { pressedAnchorAt, useRememberPressedAnchor } from "./pressed-anchor"
import { PRESSED_ANCHOR } from "./states"

export function ContextMenuHost() {
  useRememberPressedAnchor()
  useAnchorContextMenu()
  const menu = useMatomezuState(s => s.contextMenu)
  if (!menu) return null
  return (
    <ActsOnScope at={openedAt(menu)}>
      <ContextMenu key={`${menu.id}:${openedAt(menu)}:${menu.at.x}:${menu.at.y}`} menu={menu} />
    </ActsOnScope>
  )
}

function ContextMenu({ menu }: { menu: OpenedContextMenu }) {
  const { closeContextMenu } = useStoreActions()
  const items = useContextMenuItems(openedAt(menu), menu.id as ContextMenuId)
  const t = useMessages(kit)
  const readPressed = useReadPluginState(kit, PRESSED_ANCHOR)
  const [anchor] = useState(() => pressedAnchorAt(readPressed(), menu.at)) // 開いたときの、押した物のアンカー
  const shown = useAnchorMenuItems(openedAt(menu))
  const anchored = anchor === undefined ? [] : shown
  const own = useUiCatalog().contextMenuRows.get(menu.id) // メニューが自分で出す行（あれば、UI マッピングのコマンドの並びの前に出す）
  const empty = !own && items.every(i => i === SEPARATOR) && anchored.length === 0
  useEffect(() => {
    if (empty) closeContextMenu()
  }, [empty, closeContextMenu])
  const ref = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<Point>(menu.at)
  // 測った大きさで、窓からはみ出さない位置にする
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const from = menu.opens === "up" ? { x: menu.at.x, y: menu.at.y - r.height } : menu.at
    setAt(fitInside(from, { w: r.width, h: r.height }, { w: window.innerWidth, h: window.innerHeight }))
  }, [menu.at, menu.opens])
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeContextMenu()
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    window.addEventListener("resize", closeContextMenu)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
      window.removeEventListener("resize", closeContextMenu)
    }
  }, [closeContextMenu])
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus()
  }, [])
  if (empty) return null
  return (
    <div ref={ref} className={styles.menu} role="menu" aria-label={t("Menu")} style={{ left: at.x, top: at.y }}>
      {own && <OwnRows rows={own} menu={menu} />}
      {own && items.length > 0 && <hr className={styles.separator} />}
      {items.map((id, i) =>
        id === SEPARATOR ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: 区切り線は id を持たず、並びの位置で見分ける
          <hr key={`sep-${i}`} className={styles.separator} />
        ) : (
          <ContextMenuItem key={id} menu={menu} id={id} />
        ),
      )}
      {anchor !== undefined && anchored.length > 0 && (
        <>
          {items.length > 0 && <hr className={styles.separator} />}
          {anchored.map(id => (
            <AnchorMenuItem key={id} id={id} anchor={anchor} />
          ))}
        </>
      )}
    </div>
  )
}

// メニューが自分で出す行: メニューの持ち主のフック rows が、開いたときに受け取った物から出す
function OwnRows({ rows, menu }: { rows: (target: never) => readonly ContextMenuRow[]; menu: OpenedContextMenu }) {
  return rows(menu.target as never).map((row, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: 行は id を持たず、並びの位置で見分ける
    <OwnRow key={i} row={row} />
  ))
}

// 行 row: その引数でコマンドを出さないなら出さず、押せないなら出したまま押せなくする。押すと閉じてからコマンドを呼ぶ
function OwnRow({ row }: { row: ContextMenuRow }) {
  const command = useCommand(row.command, row.args as never)
  const { closeContextMenu } = useStoreActions()
  if (!command.shown) return null
  return (
    <MenuRow
      icon={row.icon}
      {...(row.iconLook ? { iconLook: row.iconLook } : {})}
      label={row.label}
      disabled={!command.enabled}
      onPick={() => {
        closeContextMenu()
        ;(command.run as (args?: unknown) => void)(row.args)
      }}
    />
  )
}

function ContextMenuItem({ menu, id }: { menu: OpenedContextMenu; id: ContextMenuCommandId<ContextMenuId> }) {
  const command = useCommand(id, menu.target as never)
  const icon = useUiCatalog().commandIcons.get(id)
  const key = useKeyLabel(id)
  const { closeContextMenu } = useStoreActions()
  const t = useMessages(kit)
  return (
    <MenuRow
      icon={icon}
      label={t(command.title)}
      keyLabel={key}
      disabled={!command.enabled}
      onPick={() => {
        closeContextMenu()
        // 引数を取らないコマンドは、渡した物を使わない
        ;(command.run as (target?: unknown) => void)(menu.target)
      }}
    />
  )
}

// anchorMenu の項目: 押すと閉じてから、押した物のアンカーの id を渡してコマンドを呼ぶ
function AnchorMenuItem({ id, anchor }: { id: AnchorMenuCommandId; anchor: string }) {
  const command = useCommand(id)
  const icon = useUiCatalog().commandIcons.get(id)
  const { closeContextMenu } = useStoreActions()
  const t = useMessages(kit)
  return (
    <MenuRow
      icon={icon}
      label={t(command.title)}
      disabled={!command.enabled}
      onPick={() => {
        closeContextMenu()
        // 引数を取らないコマンドは、渡した物を使わない
        ;(command.run as (anchor?: string) => void)(anchor)
      }}
    />
  )
}
