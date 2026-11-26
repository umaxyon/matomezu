// ページタブの＋: 押すとページのタイプの一覧のメニュー（add-page-menu）を＋の上に開く（開いている間に押すと閉じるだけ）。
// メニューの行（useAddPageRows。メニューが自分で出す行）は、開いているページのタイプを先頭に、ほかは機能台帳の順。
// 選んだタイプのページを作るダイアログを開く（コマンド page-new）。末尾の「参照…」は、書庫で選んでこのブックに参照を置く（書庫のコマンド library-reference-choose）
import type { CoreCatalog } from "../../../core/core-catalog"
import { useCommand } from "../../../ui/commands"
import { useToggledMenu } from "../../../ui/context-menu"
import { useMessages } from "../../../ui/i18n"
import type { ContextMenuRow } from "../../../ui/plugin"
import { useCatalog, useMatomezuState, useUiCatalog } from "../../../ui/store-context"
import { kit } from "../kit"
import { pageFolderFor, typeLets } from "../library/entries"
import { LIBRARY_REFERENCE_CHOOSE } from "../library/screen"
import { PAGE_ADD } from "../pages/page-add"
import { ADD_PAGE_MENU, PAGE_NEW, PAGE_NEW_IN_FOLDER } from "."
import { FileIcon } from "./FileIcon"
import styles from "./PageTabs.module.css"
import { ReferenceIcon } from "./ReferenceIcon"

// メニューに並べるタイプの id: 開いているページのタイプ first を先頭に、ほかは機能台帳の順
export function typesToAdd(catalog: CoreCatalog, first: string | null): string[] {
  const all = [...catalog.pageTypes.keys()]
  return first !== null && all.includes(first) ? [first, ...all.filter(id => id !== first)] : all
}

export function AddPageMenu({ first }: { first: string | null }) {
  const t = useMessages(kit)
  const newPage = useCommand(PAGE_NEW.id)
  const menu = useToggledMenu(ADD_PAGE_MENU)
  if (!newPage.shown) return null
  return (
    <button
      type="button"
      className={styles.add}
      aria-label={t("Add page")}
      aria-haspopup="menu"
      aria-expanded={menu.opened}
      onPointerDown={menu.pressed}
      disabled={!newPage.enabled}
      onClick={e => {
        const r = e.currentTarget.getBoundingClientRect()
        // ＋の左上を、メニューの左下にする（上へ開く）
        menu.open({ x: r.left, y: r.top - 4 }, { first }, { opens: "up" })
      }}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 3v10M3 8h10" />
      </svg>
    </button>
  )
}

// タイプ type の行の見た目: タイプの名前（機能台帳に無ければ id）とアイコン
function useTypeRowLook(): (type: string) => Pick<ContextMenuRow, "label" | "icon" | "iconLook"> {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const icons = useUiCatalog().pageTypeIcons
  return type => {
    const def = catalog.pageTypes.get(type)
    return { label: def ? t(def.title) : type, icon: icons.get(type) ?? <FileIcon />, iconLook: "picture" }
  }
}

// メニュー add-page-menu の行: タイプごとに 1 行（そのタイプのページを作るコマンド page-new。タイプがページを足すアクションを外していれば出ず、認可ステップが止めるなら押せない）と、
// 末尾に「参照…」（参照を置けるブックを開いているときだけ出る。ワーカーブックなどバックヤードの中のブックでは出ない）
export function useAddPageRows({ first }: { first: string | null }): readonly ContextMenuRow[] {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const look = useTypeRowLook()
  return [
    ...typesToAdd(catalog, first).map(type => ({ ...look(type), command: PAGE_NEW.id, args: { type } })),
    {
      label: t(LIBRARY_REFERENCE_CHOOSE.title),
      icon: <ReferenceIcon icon={<FileIcon />} />,
      iconLook: "picture",
      command: LIBRARY_REFERENCE_CHOOSE.id,
    },
  ]
}

// 書庫の画面のメニュー library-add-page-menu の行: タイプごとに 1 行（そのタイプのページを、フォルダ folder に作るコマンド page-new-in-folder）。
// タイプがページを足すアクションを外していれば出さない。folder がブックの外のバインダなら、そのバインダのタイプのページはその中に、ほかのタイプはそれを入れているフォルダに作る
export function useAddPageInRows({ folder }: { folder: string }): readonly ContextMenuRow[] {
  const catalog = useCatalog().core
  const look = useTypeRowLook()
  const folders = useMatomezuState(s => s.folders)
  return typesToAdd(catalog, null).flatMap(type => {
    const into = pageFolderFor(folders, folder, type)
    if (!catalog.pageTypes.has(type) || into === undefined || !typeLets(catalog, PAGE_ADD.id, type)) return []
    return [{ ...look(type), command: PAGE_NEW_IN_FOLDER.id, args: { type, folder: into } }]
  })
}
