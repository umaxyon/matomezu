// 利用者の設定の見た目: 土台が読む項目と利用者の文字の色のビュー、設定の並び

import { CORNER_STATUS_ORDER } from "../corner-status/corner-order"
import { ContextScaleSetting } from "../participant/ContextScaleSetting"
import { CONTEXT_SCALE } from "../participant/context-gauge"
import { TextColorsSetting } from "../text/TextColorsSetting"
import { USER_TEXT_COLORS } from "../text/text-colors"
import { CornerStatusOrderSetting } from "./CornerStatusOrderSetting"
import { EnabledPluginsSetting } from "./EnabledPluginsSetting"
import { ENABLED_PLUGINS } from "./enabled-plugins"
import { SettingsDialog } from "./SettingsDialog"
import { SETTINGS_DIALOG } from "./settings-screen"
import { UserNameSetting } from "./UserNameSetting"
import { LANG, SKIN, USER_NAME } from "./user-settings"
import { LangSetting, SkinSetting } from "./views"

export { UserSettings } from "./UserSettings"

export const SETTINGS_DIALOG_VIEWS = { [SETTINGS_DIALOG.id]: SettingsDialog }

export const USER_SETTING_VIEWS = {
  [LANG.id]: { control: LangSetting },
  [SKIN.id]: { control: SkinSetting },
  [USER_TEXT_COLORS.id]: { control: TextColorsSetting },
  [CORNER_STATUS_ORDER.id]: { control: CornerStatusOrderSetting },
  [ENABLED_PLUGINS.id]: { control: EnabledPluginsSetting },
  [USER_NAME.id]: { control: UserNameSetting },
  [CONTEXT_SCALE.id]: { control: ContextScaleSetting },
}

export { ChoiceSetting } from "./ChoiceSetting"
export { defineSettingsCategory, GENERAL_CATEGORY, KEYS_CATEGORY, PLUGINS_CATEGORY } from "./categories"
export { useUserName } from "./hooks"
export { SETTINGS_ICONS } from "./icons"
export { useOpenSettings } from "./open-settings"
export { SettingRow } from "./SettingRow"
export { TextSettingControl } from "./UserSettings"
