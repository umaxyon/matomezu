// 設定のアクション: 言語・スキンを変える。使えるかはホームのブックのタイプが決める（組織のホームで、変えさせない設定を決められる）
import { z } from "zod"
import { defineAction } from "../../core/def/action"
import { LANGS } from "../../core/i18n/i18n"

export const SET_LANG = defineAction({
  id: "settings.lang",
  title: "言語",
  target: "settings",
  needs: [],
  args: z.strictObject({ lang: z.enum(LANGS) }),
  run: (settings, args) => ({ next: { ...settings, lang: args.lang }, result: {} }),
})

// スキンの id は画面の側（ui の表）が持つので、ここでは形だけを見る（表に無い id は画面が自動のスキンで描く）
export const SET_SKIN = defineAction({
  id: "settings.skin",
  title: "スキン",
  target: "settings",
  needs: [],
  args: z.strictObject({ skin: z.string().min(1) }),
  run: (settings, args) => ({ next: { ...settings, skin: args.skin }, result: {} }),
})
