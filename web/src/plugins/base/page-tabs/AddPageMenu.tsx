// ページタブの＋: 押すとページのタイプの一覧のメニュー（add-page-menu）を＋の上に開く。
// メニューの行（AddPageRows。右クリックのメニューの置き場が、このメニューの頭に並べる）は、開いているページのタイプを先頭に、ほかは機能台帳の順。
// 選んだタイプのページを作るダイアログを開く（コマンド page-new）
import type { CoreCatalog } from "../../../core/core-catalog"
import type { OpenedContextMenu } from "../../../store/context-menus"
import { useCommand } from "../../../ui/commands"
import { useContextMenu } from "../../../ui/context-menu"
import { useMessages } from "../../../ui/i18n"
import { useCatalog, useUiCatalog } from "../../../ui/store-context"
import { MenuRow } from "../context-menu/MenuRow"
import { kit } from "../kit"
import { ADD_PAGE_MENU, PAGE_NEW } from "."
import { FileIcon } from "./FileIcon"
import styles from "./PageTabs.module.css"

// メニューに並べるタイプの id: 開いているページのタイプ first を先頭に、ほかは機能台帳の順
export function typesToAdd(catalog: CoreCatalog, first: string | null): string[] {
  const all = [...catalog.pageTypes.keys()]
  return first !== null && all.includes(first) ? [first, ...all.filter(id => id !== first)] : all
}

export function AddPageMenu({ first }: { first: string | null }) {
  const t = useMessages(kit)
  const newPage = useCommand(PAGE_NEW.id)
  const open = useContextMenu(ADD_PAGE_MENU)
  if (!newPage.shown) return null
  return (
    <button
      type="button"
      className={styles.add}
      aria-label={t("Add page")}
      aria-haspopup="menu"
      disabled={!newPage.enabled}
      onClick={e => {
        const r = e.currentTarget.getBoundingClientRect()
        // ＋の左上を、メニューの左下にする（右クリックのメニューの置き場が、上へ開く）
        open(
          {
            preventDefault: () => e.preventDefault(),
            stopPropagation: () => e.stopPropagation(),
            clientX: r.left,
            clientY: r.top - 4,
          },
          { first },
        )
      }}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 3v10M3 8h10" />
      </svg>
    </button>
  )
}

// メニュー add-page-menu の行: タイプごとに 1 行
export function AddPageRows({ menu, close }: { menu: OpenedContextMenu; close(): void }) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const icons = useUiCatalog().pageTypeIcons
  const newPage = useCommand(PAGE_NEW.id)
  const { first } = menu.target as { first: string | null }
  return typesToAdd(catalog, first).map(id => {
    const type = catalog.pageTypes.get(id)
    return (
      <MenuRow
        key={id}
        icon={icons.get(id) ?? <FileIcon />}
        label={type ? t(type.title) : id}
        onPick={() => {
          close()
          newPage.run({ type: id })
        }}
      />
    )
  })
}
