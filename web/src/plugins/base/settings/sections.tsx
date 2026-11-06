// 設定画面の項目: スロット settings-sections に置くウィジェット。左の一覧に題名 title を出し、選ぶと右に中身を出す。
// 中身は view か、利用者の設定の項目の id の並び settings（UserSettings がその項目だけを並べる）。base は「全体」（ほかの項目が名指していない
// 利用者の設定の全部）と「ショートカットキー」を置き、プラグインは自分の項目を足せる（並びと出すかは配置が決める）
import type { ReactNode } from "react"
import type { MessageKey } from "../../../core/i18n/i18n"
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { type PlaceInSlot, placeIn } from "../left-side-panel/ui"
import { KeysPane } from "./KeysPane"
import { SETTINGS_SECTIONS } from "./settings-screen"
import { UserSettings } from "./UserSettings"

// 項目の中身のビューが受け取る物: 設定画面を開いたステージ
export interface SettingsSectionProps {
  stage: string
}

// 設定画面の項目のウィジェット。settings を並べるなら view は書かない（書けば view が中身を描く）。
// place は、追加プラグインが既定の配置に足してほしいとき（true なら末尾、before・after ならその項目の前・後ろ）
export const defineSettingsSection = <const Id extends string>(
  def: { id: Id; title: MessageKey; place?: PlaceInSlot } & (
    | { settings: readonly string[]; view?: never }
    | { view: (props: SettingsSectionProps) => ReactNode; settings?: never }
  ),
) => {
  const settings = def.settings
  return defineWidget({
    id: def.id,
    slots: [SETTINGS_SECTIONS],
    ...(def.place ? { place: placeIn(SETTINGS_SECTIONS, def.place) } : {}),
    settingsSection: { title: def.title, ...(settings ? { settings } : {}) },
    view: def.view ?? (({ stage }: SettingsSectionProps) => <UserSettings stage={stage} settings={settings} />),
  })
}

// 全体: ほかの項目が名指していない利用者の設定の全部
export const GENERAL_SECTION = defineSettingsSection({
  id: kit.name("settings-general"),
  title: kit.message("General"),
  view: ({ stage }) => <UserSettings stage={stage} />,
})

export const KEYS_SECTION = defineSettingsSection({
  id: kit.name("settings-keys"),
  title: kit.message("Shortcut keys"),
  view: KeysPane,
})
