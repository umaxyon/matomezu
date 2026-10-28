// 見る人ごとの設定のコマンド: 言語・スキン・文字の色 1 つの上書きを変える（アクション settings-lang・settings-skin・settings-text-colors）。ホームのタイプが許すときだけ出す
import type { Lang } from "../../../core/i18n/i18n"
import { kit } from "../kit"
import { SET_LANG, SET_SKIN, SET_TEXT_COLORS } from "./actions"

export const SETTINGS_LANG = kit.defineCommand({
  id: "settings-lang",
  performs: [SET_LANG.id],
  title: "Language",
  run: (_ctx, a, lang: Lang) => {
    a.perform(SET_LANG.id, { lang })
  },
  when: () => true,
})

export const SETTINGS_SKIN = kit.defineCommand({
  id: "settings-skin",
  performs: [SET_SKIN.id],
  title: "Skin",
  run: (_ctx, a, skin: string) => {
    a.perform(SET_SKIN.id, { skin })
  },
  when: () => true,
})

// 文字の色 id の見る人の上書きを color にする（null は上書きを消す）
export const SETTINGS_TEXT_COLOR = kit.defineCommand({
  id: "settings-text-color",
  performs: [SET_TEXT_COLORS.id],
  title: "Text colors",
  run: (_ctx, a, change: { id: string; color: string | null }) => {
    a.perform(SET_TEXT_COLORS.id, { colors: { [change.id]: change.color } })
  },
  when: () => true,
})
