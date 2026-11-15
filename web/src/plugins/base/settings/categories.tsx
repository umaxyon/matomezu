// 設定カテゴリ: スロット settings-categories に置くウィジェット。左の一覧に題名 title を出し、選ぶと右に中身を出す。
// 中身は view か、利用者の設定の項目の id の並び settings（UserSettings がその項目だけを並べる）。base は「全体」（ほかの設定カテゴリが名指していない
// 利用者の設定の全部）と「ショートカットキー」を置き、プラグインは自分の設定カテゴリを足せる（並びと出すかは UI マッピングが決める）
import type { ReactNode } from "react"
import type { MessageKey } from "../../../core/i18n/i18n"
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { type PlaceInSlot, placeIn } from "../utils/place-in"
import { ENABLED_PLUGINS } from "./enabled-plugins"
import { KeysPane } from "./KeysPane"
import { SETTINGS_CATEGORIES } from "./settings-screen"
import { UserSettings } from "./UserSettings"

// 設定カテゴリのウィジェット。settings を並べるなら view は書かない（書けば view が中身を描く）。
// place は、追加プラグインが既定の UI マッピングに足してほしいとき（true なら末尾、before・after ならその設定カテゴリの前・後ろ）
export const defineSettingsCategory = <const Id extends string>(
  def: { id: Id; title: MessageKey; place?: PlaceInSlot } & (
    | { settings: readonly string[]; view?: never }
    | { view: () => ReactNode; settings?: never }
  ),
) => {
  const settings = def.settings
  return defineWidget({
    id: def.id,
    slots: [SETTINGS_CATEGORIES],
    ...(def.place ? { place: placeIn(SETTINGS_CATEGORIES, def.place) } : {}),
    settingsCategory: { title: def.title, ...(settings ? { settings } : {}) },
    view: def.view ?? (() => <UserSettings settings={settings} />),
  })
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
