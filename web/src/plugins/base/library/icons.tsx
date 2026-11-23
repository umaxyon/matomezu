// 書庫の行のアイコン（種類ごと。ページは、そのタイプのプラグインが名乗ったアイコン）と、ツリーの開閉の印、書庫の履歴のコマンドのアイコン（ステージエントリの画面の履歴のコマンドと同じ絵）
import type { EntryKind } from "../../../core/entries"
import { useUiCatalog } from "../../../ui/store-context"
import { REDO_ICON, UNDO_ICON } from "../history/icons"
import { LockIcon } from "../lock/LockIcon"
import { BirdFaceView } from "../participant/BirdFaceView"
import { asBird } from "../participant/birds"
import { BookIcon, BookOpenIcon } from "../utils/book-icons"
import { FolderIcon, FolderOpenIcon } from "../utils/folder-icons"
import { icon } from "../utils/icon"
import { LIBRARY_REDO, LIBRARY_UNDO } from "./commands"
import styles from "./LibraryView.module.css"
import type { LibraryRow } from "./outline"
import { LIBRARY_OPEN } from "./screen"

const BINDER = icon(
  <>
    <rect x="5" y="4" width="14" height="16" rx="2" />
    <path d="M9 4v16M12.5 9h3.5M12.5 13h3.5" />
  </>,
)
const PAGE = icon(
  <>
    <path d="M7 3h7l4 4v14H7z" />
    <path d="M14 3v4h4" />
  </>,
)
export const TRASH = icon(<path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />)
export const CHEVRON = icon(<path d="M9 6l6 6-6 6" />)
// 書庫のスクリーンの帯: 閉じる（窓いっぱいのとき）・右へ引っ込む（並べているとき）・広げる
export const CLOSE = icon(<path d="M6 6l12 12M18 6L6 18" />)
export const CLOSE_RIGHT = icon(<path d="M5 12h14M13 6l6 6-6 6" />)
export const EXPAND = icon(<path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />)

const ICONS = { folder: <FolderIcon />, book: <BookIcon />, binder: BINDER, page: PAGE } as const satisfies Record<
  EntryKind,
  unknown
>

export const iconOf = (kind: EntryKind) => ICONS[kind]

// 行 row のアイコンを、className（styles.icon か styles.bigIcon）の枠に描く。作業机は、そのワークルームの鳥の顔。ロック中のページ・ブックは、右上に小さな鍵を重ねる。ページは、タイプが pageTypeIcons で名乗ったアイコン（ページタブと同じ絵。
// 枠いっぱいに広げ、絵が決めていない線は引かない）。ブックは固定色の本の絵（base の BookIcon）、フォルダは固定色のフォルダの絵（FolderIcon）で、open（ツリーで中を見せている）なら開いた本・開いたフォルダ。名乗らないタイプ・バインダは、種類の絵
export function RowIcon({
  row,
  className,
  open = false,
}: {
  row: Pick<LibraryRow, "kind" | "type"> & Partial<Pick<LibraryRow, "locked" | "desk">>
  className: string | undefined
  open?: boolean
}) {
  const typed = useUiCatalog().pageTypeIcons.get(row.type)
  const bird = row.desk && asBird(row.desk.bird)
  const picture = bird ? (
    <BirdFaceView bird={bird} palette={row.desk?.palette} size={className === styles.bigIcon ? 40 : 16} />
  ) : row.kind === "book" ? (
    open ? (
      <BookOpenIcon />
    ) : (
      <BookIcon />
    )
  ) : row.kind === "folder" ? (
    open ? (
      <FolderOpenIcon />
    ) : (
      <FolderIcon />
    )
  ) : row.kind === "page" && typed !== undefined ? (
    typed
  ) : undefined
  return (
    <span className={picture === undefined ? className : `${className} ${styles.typed}`}>
      {picture ?? iconOf(row.kind)}
      {row.locked && (
        <span className={styles.lock}>
          <LockIcon />
        </span>
      )}
    </span>
  )
}

export const LIBRARY_COMMAND_ICONS = {
  [LIBRARY_UNDO.id]: UNDO_ICON,
  [LIBRARY_REDO.id]: REDO_ICON,
  [LIBRARY_OPEN.id]: icon(<path d="M3.5 5.5h6l2 2h9v11h-17z" />),
}
