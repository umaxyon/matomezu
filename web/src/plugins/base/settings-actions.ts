// 設定のアクション: 言語・スキンを変える。使えるかはホームのブックのタイプが決める（組織のホームで、変えさせない設定を決められる）
import { z } from "zod"
import { defineAction } from "../../core/def/action"

export const SET_LANG = defineAction({
  id: "settings.lang",
  title: "Language",
  target: "settings",
  needs: [],
  args: z.strictObject({ lang: z.string().min(1) }),
  // app に無い言語は断る（言語は言語パックで増えるので、表は登録表が持つ）
  run: (settings, args, ctx) =>
    ctx.registry.languages.has(args.lang) ? { next: { ...settings, lang: args.lang }, result: {} } : null,
})

// スキンの id は画面の側（ui の表）が持つので、ここでは形だけを見る（表に無い id は画面が自動のスキンで描く）
export const SET_SKIN = defineAction({
  id: "settings.skin",
  title: "Skin",
  target: "settings",
  needs: [],
  args: z.strictObject({ skin: z.string().min(1) }),
  run: (settings, args) => ({ next: { ...settings, skin: args.skin }, result: {} }),
})
