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

// "auto" か、app にあるスキン（無いスキンは断る）
export const SET_SKIN = defineAction({
  id: "settings.skin",
  title: "Skin",
  target: "settings",
  needs: [],
  args: z.strictObject({ skin: z.string().min(1) }),
  run: (settings, args, ctx) =>
    args.skin === "auto" || ctx.registry.skins.has(args.skin)
      ? { next: { ...settings, skin: args.skin }, result: {} }
      : null,
})
