// 書庫の行のアイコン（種類ごと。ページは、そのタイプのプラグインが名乗ったアイコン）と、ツリーの開閉の印、書庫の履歴のコマンドのアイコン（ステージエントリの画面の履歴のコマンドと同じ絵）
import type { EntryKind } from "../../../core/entries"
import { useUiCatalog } from "../../../ui/store-context"
import { REDO_ICON, UNDO_ICON } from "../history/icons"
import { LockIcon } from "../lock/LockIcon"
import { FileIcon } from "../page-tabs/FileIcon"
import { ReferenceIcon } from "../page-tabs/ReferenceIcon"
import { BirdFaceView } from "../participant/BirdFaceView"
import { asBird } from "../participant/birds"
import { BookIcon, BookOpenIcon } from "../utils/book-icons"
import { DocumentsFolderIcon, FolderIcon, FolderOpenIcon, WorkroomsFolderIcon } from "../utils/folder-icons"
import { icon } from "../utils/icon"
import { LIBRARY_REDO, LIBRARY_UNDO } from "./commands"
import styles from "./LibraryView.module.css"
import type { LibraryRow } from "./outline"
import { LIBRARY_OPEN, LIBRARY_REFERENCE_CHOOSE } from "./screen"
import { DOCUMENTS, WORKROOMS } from "./system-folders"

const BINDER = icon(
  <>
    <rect x="5" y="4" width="14" height="16" rx="2" />
    <path d="M9 4v16M12.5 9h3.5M12.5 13h3.5" />
  </>,
)
export const PAGE = icon(
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

export const LIBRARY_SYSTEM_FOLDER_ICONS = {
  [DOCUMENTS.id]: <DocumentsFolderIcon />,
  [WORKROOMS.id]: <WorkroomsFolderIcon />,
}

// 作業机はそのワークルームの鳥の顔、システムフォルダとページはプラグインが名乗った絵。
// 本と通常のフォルダはツリーの開閉で絵を替える。ロック中のページ・ブックは右上に小さな鍵を重ねる
export function RowIcon({
  row,
  className,
  open = false,
}: {
  row: Pick<LibraryRow, "kind" | "type" | "systemFolder" | "desk"> & { locked?: boolean }
  className: string | undefined
  open?: boolean
}) {
  const ui = useUiCatalog()
  const typed = ui.pageTypeIcons.get(row.type)
  const folderIcon = row.systemFolder === undefined ? undefined : ui.systemFolderIcons.get(row.systemFolder)
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
    (folderIcon ?? (open ? <FolderOpenIcon /> : <FolderIcon />))
  ) : row.kind === "page" && typed !== undefined ? (
    typed
  ) : row.kind === "reference" ? (
    <ReferenceIcon icon={typed ?? <FileIcon />} />
  ) : undefined
  return (
    <span className={picture === undefined ? className : `${className} ${styles.typed}`}>
      {picture ?? (row.kind === "reference" ? null : iconOf(row.kind))}
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
  // ページタブの＋のメニューで、ページのタイプの行の絵とそろえる（絵の元の色で見せる）
  [LIBRARY_REFERENCE_CHOOSE.id]: <ReferenceIcon icon={<FileIcon />} />,
}

export const LIBRARY_COMMAND_ICON_LOOKS = { [LIBRARY_REFERENCE_CHOOSE.id]: "picture" } as const
