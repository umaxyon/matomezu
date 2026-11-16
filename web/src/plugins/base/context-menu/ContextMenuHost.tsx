// 右クリックのメニューの置き場（ウィジェット menu-host）: store の開いているメニュー（contextMenu）を、押した位置に、
// UI マッピングに書いたそのメニューのコマンドの並びで描く（区切り線も）。出ていないコマンドは並べず、押せないものは押せない見た目にする。出るコマンドが無ければ閉じる。
// 外を押す・閉じるキー（キーバインドの menu-close。既定は Escape）・窓の大きさが変わると閉じ（窓から離れただけでは閉じない）、
// 項目を押すと閉じてから、右クリックされた物を渡してコマンドを呼ぶ。項目の横には、そのコマンドのキーを添える。
// 中の項目の描いている場所は、メニューを開いた場所（ui/scope.tsx）。
// 押した物にアンカーが付いていれば、どのメニューにも、区切り線のあとに UI マッピングの anchorMenu のコマンドを足し、押した物のアンカーの id を渡す
import { type ComponentType, useEffect, useLayoutEffect, useRef, useState } from "react"
import type { ContextMenuId } from "../../../core/catalog"
import type { Point } from "../../../core/geom"
import type { OpenedContextMenu } from "../../../store/context-menus"
import { useCommand } from "../../../ui/commands"
import { useAnchorMenuItems, useContextMenuItems } from "../../../ui/context-menu"
import { useMessages } from "../../../ui/i18n"
import { useKeyLabel } from "../../../ui/keys"
import { type AnchorMenuCommandId, type ContextMenuCommandId, SEPARATOR } from "../../../ui/layout"
import { ActsOnScope } from "../../../ui/scope"
import { useMatomezuState, useStoreActions, useUiCatalog } from "../../../ui/store-context"
import { kit } from "../kit"
import { ADD_PAGE_MENU } from "../page-tabs"
import { AddPageRows } from "../page-tabs/AddPageMenu"
import { useAnchorContextMenu } from "./anchor-context"
import styles from "./ContextMenuHost.module.css"
import { fitInside } from "./fit"
import { MenuRow } from "./MenuRow"
import { pressedAnchor } from "./pressed-anchor"

// メニューが自分で並べる行（UI マッピングのコマンドの並びの前に出す）と、開く向き（above なら、開いた位置を左下にして上へ開く）。
// 中身がコマンドの並びで言えないメニュー（機能台帳から決まる一覧）が書く
const OWN_ROWS: { [id: string]: { rows: ComponentType<{ menu: OpenedContextMenu; close(): void }>; above: boolean } } =
  {
    [ADD_PAGE_MENU]: { rows: AddPageRows, above: true },
  }

export function ContextMenuHost() {
  useAnchorContextMenu()
  const menu = useMatomezuState(s => s.contextMenu)
  if (!menu) return null
  return (
    <ActsOnScope at={menu.stage}>
      <ContextMenu key={`${menu.id}:${menu.stage}:${menu.at.x}:${menu.at.y}`} menu={menu} />
    </ActsOnScope>
  )
}

function ContextMenu({ menu }: { menu: OpenedContextMenu }) {
  const { closeContextMenu } = useStoreActions()
  const items = useContextMenuItems(menu.stage, menu.id as ContextMenuId)
  const t = useMessages(kit)
  const [anchor] = useState(() => pressedAnchor(menu.at)) // 開いたときの、押した物のアンカー
  const shown = useAnchorMenuItems(menu.stage)
  const anchored = anchor === undefined ? [] : shown
  const own = OWN_ROWS[menu.id]
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
    const from = own?.above ? { x: menu.at.x, y: menu.at.y - r.height } : menu.at
    setAt(fitInside(from, { w: r.width, h: r.height }, { w: window.innerWidth, h: window.innerHeight }))
  }, [menu.at, own?.above])
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
      {own && <own.rows menu={menu} close={closeContextMenu} />}
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
