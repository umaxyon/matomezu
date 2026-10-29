// 利用者の設定の見た目: 土台が読む項目と見る人の文字の色のビュー、設定の並び
import { TextColorsSetting } from "../text/TextColorsSetting"
import { USER_TEXT_COLORS } from "../text/text-colors"
import { KEYS, LANG, SKIN } from "./user-settings"
import { KeysSetting, LangSetting, SkinSetting } from "./views"

export { UserSettings } from "./UserSettings"

export const USER_SETTING_VIEWS = {
  [LANG.id]: { control: LangSetting },
  [SKIN.id]: { control: SkinSetting },
  [KEYS.id]: { control: KeysSetting },
  [USER_TEXT_COLORS.id]: { control: TextColorsSetting },
}
