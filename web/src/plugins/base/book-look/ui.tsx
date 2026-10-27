// ブックの設定の見た目: ブックの設定のダイアログと、それを開くコマンドのアイコン（歯車）と、テーマと紙の色の設定の項目のビュー

import { BOOK_SETTINGS, BOOK_SETTINGS_DIALOG } from "."
import { BookSettingsDialog } from "./BookSettingsDialog"
import { PaperColorSetting, ThemeSetting } from "./LookSettings"
import { BOOK_PAPER_COLOR, BOOK_THEME } from "./look"

export const BOOK_LOOK_DIALOG_VIEWS = { [BOOK_SETTINGS_DIALOG.id]: BookSettingsDialog }

export const BOOK_LOOK_SETTING_VIEWS = {
  [BOOK_THEME.id]: { control: ThemeSetting },
  [BOOK_PAPER_COLOR.id]: { control: PaperColorSetting },
}

export const BOOK_LOOK_ICONS = {
  [BOOK_SETTINGS.id]: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </svg>
  ),
}
