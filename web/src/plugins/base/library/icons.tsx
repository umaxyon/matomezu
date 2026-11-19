// 書庫の行のアイコン（種類ごと。ページは、そのタイプのプラグインが名乗ったアイコン）と、ツリーの開閉の印、書庫の画面の履歴のコマンドのアイコン（ブックの画面の履歴のコマンドと同じ絵）
import type { EntryKind } from "../../../core/entries"
import { useUiCatalog } from "../../../ui/store-context"
import { REDO_ICON, UNDO_ICON } from "../history/icons"
import { icon } from "../icon"
import { LIBRARY_REDO, LIBRARY_UNDO } from "./commands"
import styles from "./LibraryView.module.css"
import type { LibraryRow } from "./outline"

const FOLDER = icon(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />)
// ブックの絵: 閉じた本と開いた本（固定色。ディレクトリ構成図のブックのアイコンと同じ絵）
const BOOK = (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
    <path d="M6 2h15v20H6a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Z" fill="#4E82C2" />
    <path d="M6.5 17H21v3H6.5a1.5 1.5 0 0 1 0-3Z" fill="#DCE8F7" />
    <path d="M7.5 18.5H21" stroke="#A2BBD9" strokeWidth=".8" strokeLinecap="round" />
    <path d="M7 3.5v11.75" stroke="#35679F" strokeWidth="1.25" strokeLinecap="round" />
    <path d="M11 6h6M11 9h4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)
const BOOK_OPEN = (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
    <g transform="translate(0 .75) scale(1 .95)">
      <path d="M6 3.5h15V22H6a3 3 0 0 1-3-3V6.5a3 3 0 0 1 3-3Z" fill="#4E82C2" />
      <path d="M6 3.5h15V17H6Z" fill="#EDF3FA" />
      <path d="M6.5 17H21v3H6.5a1.5 1.5 0 0 1 0-3Z" fill="#DCE8F7" />
      <path d="M7.5 18.5H21M16 7h3M16 10h3" stroke="#A2BBD9" strokeWidth=".8" strokeLinecap="round" />
      <path d="M5 3.5 17.3 0V15.5L5 18.5Z" fill="#4E82C2" />
      <path d="M5 4v14" stroke="#35679F" strokeWidth="1.2" strokeLinecap="round" />
      <path d="m8 5.5 5-1.30M8 8.5l3.7-.97" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    </g>
  </svg>
)
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

const ICONS = { folder: FOLDER, book: BOOK, binder: BINDER, page: PAGE } as const satisfies Record<EntryKind, unknown>

export const iconOf = (kind: EntryKind) => ICONS[kind]

// 行 row のアイコンを、className（styles.icon か styles.bigIcon）の枠に描く。ページは、タイプが pageTypeIcons で名乗ったアイコン（ページタブと同じ絵。
// 枠いっぱいに広げ、絵が決めていない線は引かない）。ブックは固定色の本の絵で、open（ツリーで中を見せている）なら開いた本。名乗らないタイプ・バインダは、種類の絵
export function RowIcon({
  row,
  className,
  open = false,
}: {
  row: Pick<LibraryRow, "kind" | "type">
  className: string | undefined
  open?: boolean
}) {
  const typed = useUiCatalog().pageTypeIcons.get(row.type)
  if (row.kind === "book") return <span className={`${className} ${styles.typed}`}>{open ? BOOK_OPEN : BOOK}</span>
  return row.kind === "page" && typed !== undefined ? (
    <span className={`${className} ${styles.typed}`}>{typed}</span>
  ) : (
    <span className={className}>{iconOf(row.kind)}</span>
  )
}

export const LIBRARY_COMMAND_ICONS = {
  [LIBRARY_UNDO.id]: UNDO_ICON,
  [LIBRARY_REDO.id]: REDO_ICON,
}
