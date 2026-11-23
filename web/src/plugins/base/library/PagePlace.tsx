// ブックの外のページの置き場所の表示（ウィジェット page-place）: ブックの外のページを開いているステージの下の行で、名前のすぐ右に、フォルダの絵と
// そのページの入っているフォルダまでの名前を小さい薄い字で出す（書庫ホームに直に在れば書庫。フォルダの中なら、書庫ホームの下から）。
// 全体が 1 つのボタンで、押すと書庫でそのフォルダを開く（コマンド library-place-open）。入り切らなければ頭の側を省き、入っているフォルダの名前は残す。乗せると全部を出す。
// ブックを開いているステージ・何も開いていないステージには出さない

import { useShallow } from "zustand/react/shallow"
import { namingOf, titleOf } from "../../../core/entries"
import { NO_PAGE } from "../../../core/stage"
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { defineWidget } from "../../../ui/layout"
import { useCatalog, useMatomezuState } from "../../../ui/store-context"
import { usePage } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { FolderIcon } from "../utils/folder-icons"
import { STAGE_SLOTS } from "../workspace/ui"
import { useNameOf } from "./hooks"
import { NO_TITLE, outsidePagePlaceOf } from "./outline"
import styles from "./PagePlace.module.css"
import { LIBRARY_PLACE_OPEN } from "./screen"

const NO_PLACE: readonly string[] = []

function PagePlace() {
  const t = useMessages(kit)
  const page = usePage()
  const outside = page === NO_PAGE ? undefined : page.id
  const catalog = useCatalog().core
  const nameOf = useNameOf()
  const open = useCommand(LIBRARY_PLACE_OPEN.id)
  const path = useMatomezuState(
    useShallow(s => (outside === undefined ? NO_PLACE : outsidePagePlaceOf(s.folders, outside))),
  )
  const titles = useMatomezuState(
    useShallow(s => path.map(id => titleOf(s, "folder", id, namingOf(catalog, s.settings)) ?? NO_TITLE)),
  )
  const place = path.map((id, i) => ({ id, title: titles[i] ?? NO_TITLE }))
  if (place.length === 0 || !open.shown) return null
  // 書庫ホームの名前は、書庫ホームに直に在るときだけ出す
  const names = (place.length > 1 ? place.slice(1) : place).map(nameOf)
  const whole = names.join(" › ")
  return (
    <button
      type="button"
      className={styles.place}
      aria-label={t("Place: {path}", { path: whole })}
      title={whole}
      disabled={!open.enabled}
      onClick={() => open.run()}
    >
      <FolderIcon size={14} />
      {names.length > 1 && (
        <span className={styles.head}>
          <bdi>{names.slice(0, -1).join(" › ")}</bdi>
        </span>
      )}
      {names.length > 1 && <span className={styles.mark}>›</span>}
      <span className={styles.holder}>{names.at(-1)}</span>
    </button>
  )
}

export const PAGE_PLACE = defineWidget({
  id: kit.name("page-place"),
  slots: STAGE_SLOTS,
  view: PagePlace,
})
