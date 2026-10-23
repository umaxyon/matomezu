// ブックの設定の見た目: ブックの設定のダイアログと、それを開くコマンドのアイコン（歯車）
import { BookSettingsDialog } from "./BookSettingsDialog"

export const BOOK_LOOK_DIALOG_VIEWS = { "book.settings": BookSettingsDialog }

export const BOOK_LOOK_ICONS = {
  "book.settings": (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </svg>
  ),
}
