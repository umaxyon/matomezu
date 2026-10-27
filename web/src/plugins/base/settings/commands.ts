// 見る人ごとの設定のコマンド: 言語・スキンを変える（アクション settings-lang・settings-skin）。ホームのタイプが許すときだけ出す
import type { Lang } from "../../../core/i18n/i18n"
import { kit } from "../kit"
import { SET_LANG, SET_SKIN } from "./actions"

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
