// ブックの設定の見た目: ブックの設定のダイアログと、それを開くコマンドのアイコン（歯車）と、テーマと紙の色の設定の項目のビュー

import { GEAR_ICON } from "../utils/gear-icon"
import { BOOK_SETTINGS, BOOK_SETTINGS_DIALOG } from "."
import { BookSettingsDialog } from "./BookSettingsDialog"
import { PaperColorSetting, ThemeSetting } from "./LookSettings"
import { PAGE_PAPER_COLOR, PAGE_THEME } from "./look"

export const BOOK_LOOK_DIALOG_VIEWS = { [BOOK_SETTINGS_DIALOG.id]: BookSettingsDialog }

export const BOOK_LOOK_SETTING_VIEWS = {
  [PAGE_THEME.id]: { control: ThemeSetting },
  [PAGE_PAPER_COLOR.id]: { control: PaperColorSetting },
}

export const BOOK_LOOK_ICONS = {
  [BOOK_SETTINGS.id]: GEAR_ICON,
}
