// 見る人ごとの設定のコマンド: 言語・スキンを変える（アクション settings-lang・settings-skin）。ホームのタイプが許すときだけ出す
import type { Lang } from "../../../core/i18n/i18n"
import { homeActions } from "../../../core/perform"
import type { CommandContext } from "../../../store/commands/def"
import { kit } from "../kit"

const allows = (action: string) => (ctx: CommandContext) => homeActions(ctx.catalog, ctx.home).includes(action)

export const SETTINGS_LANG = kit.defineCommand({
  id: "settings-lang",
  title: "Language",
  run: (_ctx, a, lang: Lang) => {
    a.setLang(lang)
  },
  when: allows("@matomezu/base:settings-lang"),
})

export const SETTINGS_SKIN = kit.defineCommand({
  id: "settings-skin",
  title: "Skin",
  run: (_ctx, a, skin: string) => {
    a.setSkin(skin)
  },
  when: allows("@matomezu/base:settings-skin"),
})
