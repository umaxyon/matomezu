// 見る人ごとの設定のコマンド: 言語・スキンを変える（アクション settings-lang・settings-skin）。ホームのタイプが許すときだけ出す
import type { Lang } from "../../../core/i18n/i18n"
import { kit } from "../kit"

export const SETTINGS_LANG = kit.defineCommand({
  id: "settings-lang",
  performs: ["@matomezu/base:settings-lang"],
  title: "Language",
  run: (_ctx, a, lang: Lang) => {
    a.perform("@matomezu/base:settings-lang", { lang })
  },
  when: () => true,
})

export const SETTINGS_SKIN = kit.defineCommand({
  id: "settings-skin",
  performs: ["@matomezu/base:settings-skin"],
  title: "Skin",
  run: (_ctx, a, skin: string) => {
    a.perform("@matomezu/base:settings-skin", { skin })
  },
  when: () => true,
})
