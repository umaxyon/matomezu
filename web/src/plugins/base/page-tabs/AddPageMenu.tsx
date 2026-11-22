// ページタブの＋: 押すとページのタイプの一覧のメニュー（add-page-menu）を＋の上に開く。
// メニューの行（useAddPageRows。メニューが自分で出す行）は、開いているページのタイプを先頭に、ほかは機能台帳の順。
// 選んだタイプのページを作るダイアログを開く（コマンド page-new）
import { useRef } from "react"
import type { CoreCatalog } from "../../../core/core-catalog"
import { useCommand } from "../../../ui/commands"
import { useButtonMenu } from "../../../ui/context-menu"
import { useMessages } from "../../../ui/i18n"
import type { ContextMenuRow } from "../../../ui/plugin"
import { useCatalog, useMatomezuState, useUiCatalog } from "../../../ui/store-context"
import { kit } from "../kit"
import { folderForType, typeLets } from "../library/entries"
import { PAGE_ADD } from "../pages/page-add"
import { ADD_PAGE_MENU, PAGE_NEW, PAGE_NEW_IN } from "."
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
  const open = useButtonMenu(ADD_PAGE_MENU)
  // 開いている間に＋を押したら、閉じるだけにする（外を押した扱いで先に閉じるので、押し始めに開いていたかを覚える）
  const opened = useMatomezuState(s => s.contextMenu?.id === ADD_PAGE_MENU)
  const wasOpened = useRef(false)
  if (!newPage.shown) return null
  return (
    <button
      type="button"
      className={styles.add}
      aria-label={t("Add page")}
      aria-haspopup="menu"
      aria-expanded={opened}
      onPointerDown={() => {
        wasOpened.current = opened
      }}
      disabled={!newPage.enabled}
      onClick={e => {
        if (wasOpened.current) return
        const r = e.currentTarget.getBoundingClientRect()
        // ＋の左上を、メニューの左下にする（上へ開く）
        open({ x: r.left, y: r.top - 4 }, { first }, { opens: "up" })
      }}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 3v10M3 8h10" />
      </svg>
    </button>
  )
}

// メニュー add-page-menu の行: タイプごとに 1 行（そのタイプのページを作るコマンド page-new。タイプがページを足すアクションを外していれば出ず、認可ステップが止めるなら押せない）
export function useAddPageRows({ first }: { first: string | null }): readonly ContextMenuRow[] {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const icons = useUiCatalog().pageTypeIcons
  return typesToAdd(catalog, first).map(type => {
    const def = catalog.pageTypes.get(type)
    return {
      command: PAGE_NEW.id,
      args: { type },
      label: def ? t(def.title) : type,
      icon: icons.get(type) ?? <FileIcon />,
      iconLook: "picture",
    }
  })
}

// 書庫の画面のメニュー library-add-page-menu の行: タイプごとに 1 行（そのタイプのページを、フォルダ folder に作るコマンド page-new-in）。
// タイプがページを足すアクションを外していれば出さない。folder がブックの外のバインダなら、そのバインダのタイプのページはその中に、ほかのタイプはそれを入れているフォルダに作る
export function useAddPageInRows({ folder }: { folder: string }): readonly ContextMenuRow[] {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const icons = useUiCatalog().pageTypeIcons
  const folders = useMatomezuState(s => s.folders)
  return typesToAdd(catalog, null).flatMap(type => {
    const def = catalog.pageTypes.get(type)
    const into = folderForType(folders, folder, type)
    if (!def || into === undefined || !typeLets(catalog, PAGE_ADD.id, type)) return []
    return [
      {
        command: PAGE_NEW_IN.id,
        args: { type, folder: into },
        label: t(def.title),
        icon: icons.get(type) ?? <FileIcon />,
        iconLook: "picture" as const,
      },
    ]
  })
}
