// 開いている物の置き場所の表示（ウィジェット page-place）: ステージの下の行で、名前のすぐ右に出す 1 つのボタン。押すと書庫でその物の入っているフォルダを開き、
// その物を選ぶ（コマンド library-place-open。ワーカーブックなら、それを映している作業机を開いて、そのブックを選ぶ）。
// ブックの外のページは、フォルダの絵と、そのページの入っているフォルダまでの名前を小さい薄い字で出す（書庫ホームに直に在れば書庫。フォルダの中なら、書庫ホームの下から）。
// 入り切らなければ頭の側を省き、入っているフォルダの名前は残す。乗せると全部を出す。
// ブックとブックの外のバインダは、右にページのタブが並ぶので、フォルダの絵だけを出す（道は乗せたときに出す）。
// 書庫の上に置き場所の無い物（作業机に映っていないワーカーブックなど）と、何も開いていないステージには出さない

import { useShallow } from "zustand/react/shallow"
import { namingOf } from "../../../core/entries"
import { NO_PAGE } from "../../../core/stage"
import { NO_BOOK, NO_OUTSIDE_BINDER } from "../../../store/commands/def"
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { defineWidget } from "../../../ui/layout"
import { useCatalog, useMatomezuState } from "../../../ui/store-context"
import { useBook, useOutsideBinder, usePage } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { FolderIcon } from "../utils/folder-icons"
import { STAGE_SLOTS } from "../workspace/ui"
import { useNameOf, useWorkdesks } from "./hooks"
import { entryPlaceOf, folderTitleOf, NO_LIBRARY_PLACE } from "./outline"
import styles from "./PagePlace.module.css"
import { LIBRARY_PLACE_OPEN } from "./screen"

const NO_PATH: readonly string[] = []

function PagePlace() {
  const t = useMessages(kit)
  const book = useBook()
  const binder = useOutsideBinder()
  const page = usePage()
  // 開いている物: ブック、ブックの外のバインダ、ブックの外のページの順（ブックやバインダを開いていれば、page はその中のページ）
  const entry =
    book !== NO_BOOK ? book.id : binder !== NO_OUTSIDE_BINDER ? binder.id : page !== NO_PAGE ? page.id : undefined
  const tabbed = book !== NO_BOOK || binder !== NO_OUTSIDE_BINDER
  const catalog = useCatalog().core
  const nameOf = useNameOf()
  const desks = useWorkdesks()
  const open = useCommand(LIBRARY_PLACE_OPEN.id, entry === undefined ? undefined : { entry })
  const path = useMatomezuState(
    useShallow(s => {
      const place = entry === undefined ? NO_LIBRARY_PLACE : entryPlaceOf(s.folders, entry, desks)
      return place === NO_LIBRARY_PLACE ? NO_PATH : place.path
    }),
  )
  const titles = useMatomezuState(
    useShallow(s => path.map(id => folderTitleOf(s, id, namingOf(catalog, s.settings), desks))),
  )
  const place = path.map((id, i) => ({ id, title: titles[i] ?? "" }))
  if (entry === undefined || place.length === 0 || !open.shown) return null
  // 書庫ホームの名前は、書庫ホームに直に在るときだけ出す
  const names = (place.length > 1 ? place.slice(1) : place).map(nameOf)
  const whole = names.join(" › ")
  return (
    <button
      type="button"
      className={tabbed ? `${styles.place} ${styles.icon}` : styles.place}
      aria-label={t("Place: {path}", { path: whole })}
      title={whole}
      disabled={!open.enabled}
      onClick={() => open.run({ entry })}
    >
      <FolderIcon size={14} />
      {!tabbed && names.length > 1 && (
        <span className={styles.head}>
          <bdi>{names.slice(0, -1).join(" › ")}</bdi>
        </span>
      )}
      {!tabbed && names.length > 1 && <span className={styles.mark}>›</span>}
      {!tabbed && <span className={styles.holder}>{names.at(-1)}</span>}
    </button>
  )
}

export const PAGE_PLACE = defineWidget({
  id: kit.name("page-place"),
  slots: STAGE_SLOTS,
  view: PagePlace,
})
