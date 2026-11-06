// 設定カテゴリ: スロット settings-categories に置くウィジェット。左の一覧に題名 title を出し、選ぶと右に中身を出す。
// 中身は view か、利用者の設定の項目の id の並び settings（UserSettings がその項目だけを並べる）。base は「全体」（ほかの設定カテゴリが名指していない
// 利用者の設定の全部）と「ショートカットキー」を置き、プラグインは自分の設定カテゴリを足せる（並びと出すかは配置が決める）
import type { ReactNode } from "react"
import type { MessageKey } from "../../../core/i18n/i18n"
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { type PlaceInSlot, placeIn } from "../left-side-panel/ui"
import { KeysPane } from "./KeysPane"
import { SETTINGS_CATEGORIES } from "./settings-screen"
import { UserSettings } from "./UserSettings"

// 設定カテゴリの中身のビューが受け取る物: 設定画面を開いたステージ
export interface SettingsCategoryProps {
  stage: string
}

// 設定カテゴリのウィジェット。settings を並べるなら view は書かない（書けば view が中身を描く）。
// place は、追加プラグインが既定の配置に足してほしいとき（true なら末尾、before・after ならその設定カテゴリの前・後ろ）
export const defineSettingsCategory = <const Id extends string>(
  def: { id: Id; title: MessageKey; place?: PlaceInSlot } & (
    | { settings: readonly string[]; view?: never }
    | { view: (props: SettingsCategoryProps) => ReactNode; settings?: never }
  ),
) => {
  const settings = def.settings
  return defineWidget({
    id: def.id,
    slots: [SETTINGS_CATEGORIES],
    ...(def.place ? { place: placeIn(SETTINGS_CATEGORIES, def.place) } : {}),
    settingsCategory: { title: def.title, ...(settings ? { settings } : {}) },
    view: def.view ?? (({ stage }: SettingsCategoryProps) => <UserSettings stage={stage} settings={settings} />),
  })
}

// 全体: ほかの設定カテゴリが名指していない利用者の設定の全部
export const GENERAL_CATEGORY = defineSettingsCategory({
  id: kit.name("settings-general"),
  title: kit.message("General"),
  view: ({ stage }) => <UserSettings stage={stage} />,
})

export const KEYS_CATEGORY = defineSettingsCategory({
  id: kit.name("settings-keys"),
  title: kit.message("Shortcut keys"),
  view: KeysPane,
})
