// 見る人ごとの設定のコマンド: 言語・スキンを変える
import type { Lang } from "../../core/i18n/i18n"
import { defineCommand } from "../../store/commands/def"

export const SETTINGS_LANG = defineCommand({
  id: "settings.lang",
  title: "言語",
  run: (_ctx, a, lang: Lang) => a.setLang(lang),
  when: () => true,
})

export const SETTINGS_SKIN = defineCommand({
  id: "settings.skin",
  title: "スキン",
  run: (_ctx, a, skin: string) => a.setSkin(skin),
  when: () => true,
})
