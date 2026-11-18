// 書庫の行のアイコン（種類ごと）と、ツリーの開閉の印
import type { EntryKind } from "../../../core/entries"
import { icon } from "../icon"

const FOLDER = icon(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />)
const BOOK = icon(
  <>
    <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
    <path d="M5 17a3 3 0 0 1 3-3h11" />
  </>,
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
