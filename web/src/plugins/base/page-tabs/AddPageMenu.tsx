// ページタブの＋: 押すとページのタイプの一覧のメニューを出し（開いているページのタイプが先頭）、選んだタイプのページを作るダイアログを開く（コマンド page-new）。
// メニューは＋の上に出し（ページタブは下の行）、外を押す・Escape で閉じる。見た目は右クリックのメニューと同じ
import { useEffect, useRef, useState } from "react"
import type { CoreCatalog } from "../../../core/core-catalog"
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { useCatalog, useUiCatalog } from "../../../ui/store-context"
import menuStyles from "../context-menu/ContextMenuHost.module.css"
import { kit } from "../kit"
import { PAGE_NEW } from "."
import { FileIcon } from "./FileIcon"
import styles from "./PageTabs.module.css"

// メニューに並べるタイプの id: 開いているページのタイプ first を先頭に、ほかは機能台帳の順
export function typesToAdd(catalog: CoreCatalog, first: string | null): string[] {
  const all = [...catalog.pageTypes.keys()]
  return first !== null && all.includes(first) ? [first, ...all.filter(id => id !== first)] : all
}

export function AddPageMenu({ first }: { first: string | null }) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const icons = useUiCatalog().pageTypeIcons
  const newPage = useCommand(PAGE_NEW.id)
  // 開いているなら、メニューの左下を置く所（画面の座標。＋の左上）
  const [open, setOpen] = useState<{ left: number; bottom: number } | null>(null)
  const box = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null)
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    document.addEventListener("keydown", onKey)
    box.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus()
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])
  if (!newPage.shown) return null
  return (
    <span ref={box} className={styles.addBox}>
      <button
        type="button"
        className={styles.add}
        aria-label={t("Add page")}
        aria-haspopup="menu"
        aria-expanded={open !== null}
        disabled={!newPage.enabled}
        onClick={e => {
          const r = e.currentTarget.getBoundingClientRect()
          setOpen(o => (o ? null : { left: r.left, bottom: window.innerHeight - r.top + 4 }))
        }}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 3v10M3 8h10" />
        </svg>
      </button>
      {open && (
        <div className={menuStyles.menu} role="menu" aria-label={t("Add page")} style={open}>
          {typesToAdd(catalog, first).map(id => {
            const type = catalog.pageTypes.get(id)
            return (
              <button
                key={id}
                type="button"
                role="menuitem"
                className={menuStyles.item}
                onClick={() => {
                  setOpen(null)
                  newPage.run({ type: id })
                }}
              >
                <span className={menuStyles.icon}>{icons.get(id) ?? <FileIcon />}</span>
                <span className={menuStyles.label}>{type ? t(type.title) : id}</span>
              </button>
            )
          })}
        </div>
      )}
    </span>
  )
}
