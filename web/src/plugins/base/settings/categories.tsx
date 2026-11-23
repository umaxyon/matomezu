// 設定カテゴリ: スロット settings-categories に置くウィジェット。左の一覧に題名 title を出し、選ぶと右に中身を出す。
// 中身は view か、利用者の設定の項目の id の並び settings（UserSettings がその項目だけを並べる）。base は「ユーザー設定」（利用者名と、プラグインが置く節）と
// 「全体」（ほかの設定カテゴリと節が名指していない利用者の設定の全部）と「ショートカットキー」を置き、プラグインは自分の設定カテゴリを足せる（並びと出すかは UI マッピングが決める）
import type { ReactNode } from "react"
import type { SlotId } from "../../../core/catalog"
import type { MessageKey } from "../../../core/i18n/i18n"
import { useMessages } from "../../../ui/i18n"
import { defineWidget } from "../../../ui/layout"
import type { UserSettingControlProps } from "../../../ui/plugin"
import { Slot } from "../../../ui/Slot"
import { kit } from "../kit"
import { type PlaceInSlot, placeIn } from "../utils/place-in"
import { ENABLED_PLUGINS } from "./enabled-plugins"
import { KeysPane } from "./KeysPane"
import { SETTINGS_CATEGORIES, SETTINGS_SECTIONS } from "./settings-screen"
import { TextSettingControl, UserSettings } from "./UserSettings"
import { USER_NAME } from "./user-settings"

// 設定カテゴリのウィジェット。settings は名指す利用者の設定の項目（「全体」に出さない）で、view を書かなければ UserSettings がそれを並べ、書けば view が中身を描く。
// place は、追加プラグインが既定の UI マッピングに足してほしいとき（true なら末尾、before・after ならその設定カテゴリの前・後ろ）
export const defineSettingsCategory = <const Id extends string>(
  def: { id: Id; title: MessageKey; place?: PlaceInSlot; opens?: readonly SlotId[] } & (
    | { settings: readonly string[]; view?: () => ReactNode }
    | { view: () => ReactNode; settings?: never }
  ),
) => {
  const settings = def.settings
  return defineWidget({
    id: def.id,
    slots: [SETTINGS_CATEGORIES],
    ...(def.place ? { place: placeIn(SETTINGS_CATEGORIES, def.place) } : {}),
    ...(def.opens ? { opens: def.opens } : {}),
    settingsCategory: { title: def.title, ...(settings ? { settings } : {}) },
    view: def.view ?? (() => <UserSettings settings={settings} />),
  })
}

// 設定カテゴリ「ユーザー設定」の中の節のウィジェット: settings は節が並べる利用者の設定の項目（「全体」に出さない）、view は節の中身（見出しも描く）。
// place は、追加プラグインが既定の UI マッピングに足してほしいとき
export const defineSettingsSection = <const Id extends string>(def: {
  id: Id
  settings: readonly string[]
  view: () => ReactNode
  place?: PlaceInSlot
}) =>
  defineWidget({
    id: def.id,
    slots: [SETTINGS_SECTIONS],
    ...(def.place ? { place: placeIn(SETTINGS_SECTIONS, def.place) } : {}),
    settingsSection: { settings: def.settings },
    view: def.view,
  })

// ユーザー設定: 利用者名と、その下にプラグインが置く節（スロット settings-sections）
export const USER_CATEGORY = defineSettingsCategory({
  id: kit.name("settings-user"),
  title: kit.message("User settings"),
  settings: [USER_NAME.id],
  opens: [SETTINGS_SECTIONS],
  view: () => (
    <>
      <UserSettings settings={[USER_NAME.id]} />
      <Slot name={SETTINGS_SECTIONS} props={{}} />
    </>
  ),
})

// 利用者名の項目のビュー: 空なら「あなた」を薄く出す
export function UserNameSetting(props: UserSettingControlProps<string>) {
  const t = useMessages(kit)
  return <TextSettingControl {...props} placeholder={t("You")} />
}

// 全体: ほかの設定カテゴリが名指していない利用者の設定の全部
export const GENERAL_CATEGORY = defineSettingsCategory({
  id: kit.name("settings-general"),
  title: kit.message("General"),
  view: () => <UserSettings />,
})

// プラグイン: 追加プラグインの有効・無効
export const PLUGINS_CATEGORY = defineSettingsCategory({
  id: kit.name("settings-plugins"),
  title: kit.message("Plugins"),
  settings: [ENABLED_PLUGINS.id],
})

export const KEYS_CATEGORY = defineSettingsCategory({
  id: kit.name("settings-keys"),
  title: kit.message("Shortcut keys"),
  view: KeysPane,
})
