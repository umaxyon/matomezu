// ツールボックスのビュー（ウィジェット toolbox）: ステージのブックのツールボックス（toolbox.ts）を横に並べる。出すツールが無ければ何も描かない。
// 押すとそのアイテムを置こうとし（もう一度押すと取り消す）、置こうとしているものは押されている見た目にする。
// 形のパネルに並べるアイテムがあれば、最後に「形」のボタンを 1 つ出す。押すと、その上に形のアイコンの格子（パネル）を開き、
// 形を押すとその形を置こうとして、パネルを閉じる（ドロワーの中ならドロワーも下げる）。パネルの外を押すか Escape でも閉じる。
// 形のパネルのどれかを置こうとしている間は、「形」のボタンを押されている見た目にする
import { useEffect, useRef, useState } from "react"
import type { ItemId } from "../../../core/core-catalog"
import { useMessages } from "../../../ui/i18n"
import { useActions, useCatalog, useMatomezuState, useUiCatalog } from "../../../ui/store-context"
import { useCloseDrawer } from "../book-name/drawer-context"
import { kit } from "../kit"
import styles from "./ToolboxView.module.css"
import { panelOf, toolboxOf } from "./toolbox"

export function ToolboxView({ stage }: { stage: string }) {
  const book = useMatomezuState(s => {
    const o = s.workspace.stages.find(st => st.id === stage)?.opened
    return o ? s.books[o.book] : undefined
  })
  const placing = useMatomezuState(s => s.workspace.stages.find(st => st.id === stage)?.placing ?? null)
  const { togglePlacing } = useActions()
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const tools = book ? toolboxOf(catalog, book) : []
  const panel = book ? panelOf(catalog, book) : []
  if (tools.length === 0 && panel.length === 0) return null
  return (
    <div className={styles.toolbox} role="toolbar" aria-label={t("Tools")}>
      {tools.map(id => (
        <ToolButton
          key={id}
          id={id}
          className={styles.tool}
          pressed={placing === id}
          onClick={() => togglePlacing(stage, id)}
        />
      ))}
      {panel.length > 0 && (
        <ShapePanel
          items={panel}
          placing={placing}
          onPick={id => {
            if (placing !== id) togglePlacing(stage, id)
          }}
        />
      )}
    </div>
  )
}

// アイテム 1 つのボタン（アイコンと、名前の読み上げと吹き出し）
function ToolButton({
  id,
  className,
  pressed,
  onClick,
}: {
  id: ItemId
  className: string | undefined
  pressed: boolean
  onClick: () => void
}) {
  const t = useMessages(kit)
  const def = useCatalog().core.items.get(id)
  const icon = useUiCatalog().items.get(id)?.icon
  const title = def ? t(def.title) : id
  return (
    <button
      type="button"
      className={className}
      aria-label={title}
      title={title}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {icon}
    </button>
  )
}

// 「形」のボタンと、その上に開くパネル
function ShapePanel({
  items,
  placing,
  onPick,
}: {
  items: readonly ItemId[]
  placing: string | null
  onPick: (id: ItemId) => void
}) {
  const t = useMessages(kit)
  const close = useCloseDrawer()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (!(e.target instanceof Node && ref.current?.contains(e.target))) setOpen(false)
    }
    // Escape はパネルを閉じるだけにする（キーの受け口より先に受け、置くのをやめるまで届かせない）
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) return
      e.stopPropagation()
      setOpen(false)
    }
    window.addEventListener("pointerdown", outside, true)
    window.addEventListener("keydown", onEscape, true)
    return () => {
      window.removeEventListener("pointerdown", outside, true)
      window.removeEventListener("keydown", onEscape, true)
    }
  }, [open])
  const placingHere = placing !== null && items.includes(placing as ItemId)
  return (
    <div ref={ref} className={styles.panelHost}>
      <button
        type="button"
        className={styles.tool}
        aria-label={t("Shapes")}
        title={t("Shapes")}
        aria-haspopup="true"
        aria-expanded={open}
        aria-pressed={placingHere}
        onClick={() => setOpen(o => !o)}
      >
        <ShapesIcon />
      </button>
      {open && (
        <fieldset className={styles.panel} aria-label={t("Shapes")}>
          {items.map(id => (
            <ToolButton
              key={id}
              id={id}
              className={styles.cell}
              pressed={placing === id}
              onClick={() => {
                onPick(id)
                setOpen(false)
                close?.()
              }}
            />
          ))}
        </fieldset>
      )}
    </div>
  )
}

// 「形」のアイコン: 四角と円を重ねた印
function ShapesIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="10" height="10" rx="1.5" />
      <circle cx="16" cy="16" r="5" />
    </svg>
  )
}
