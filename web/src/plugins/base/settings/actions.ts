// 設定のアクション: 言語・スキン・キーの割り当ての変更・文字の色の上書きを変える。使えるかはホームのブックのタイプが決める（組織のホームで、変えさせない設定を決められる）
import { z } from "zod"
import { HEX } from "../../../core/color"
import { KeyChangesSchema } from "../../../core/keys"
import { kit } from "../kit"

export const SET_LANG = kit.defineAction({
  id: "settings-lang",
  aiDescription:
    "Change the language of the user's matomezu: lang is one of the languages in actions (a language it does not have is refused).",
  title: "Language",
  target: "settings",
  args: z.strictObject({ lang: z.string().min(1) }),
  // インスタンスに無い言語は断る（言語は言語パックで増えるので、表は機能台帳が持つ）
  run: (settings, args, ctx) =>
    ctx.catalog.languages.has(args.lang) ? { next: { ...settings, lang: args.lang }, result: {} } : null,
})

// "auto" か、インスタンスにあるスキン（無いスキンは断る）
export const SET_SKIN = kit.defineAction({
  id: "settings-skin",
  aiDescription:
    "Change how the user's matomezu looks: skin is auto (follow the OS's light or dark) or one of the skins in actions (a skin it does not have is refused).",
  title: "Skin",
  target: "settings",
  args: z.strictObject({ skin: z.string().min(1) }),
  run: (settings, args, ctx) =>
    args.skin === "auto" || ctx.catalog.skins.has(args.skin)
      ? { next: { ...settings, skin: args.skin }, result: {} }
      : null,
})

// 文字の色の、見る人の上書きを変える: 書いた色だけを変え、null は上書きを消す（ブックの色に戻る）。無い色の id・形の合わない色は断る
export const SET_TEXT_COLORS = kit.defineAction({
  id: "settings-text-colors",
  aiDescription:
    "Change the user's own text colors, which win over the book's and the text color's (keyed by the text color's id from textColors in actions, #rrggbb). Only what is given changes; null removes the user's color.",
  title: "Text colors",
  target: "settings",
  args: z.strictObject({ colors: z.record(z.string(), z.string().regex(HEX).nullable()) }),
  run: (settings, args, ctx) => {
    if (Object.keys(args.colors).some(id => !ctx.catalog.textColors.has(id))) return null
    const next: Record<string, string> = { ...settings.textColors }
    for (const [id, hex] of Object.entries(args.colors)) {
      if (hex === null) delete next[id]
      else next[id] = hex.toLowerCase()
    }
    return { next: { ...settings, textColors: next }, result: {} }
  },
})

// キーの割り当ての、利用者の変更（足した行・外した既定の行）を丸ごと置き換える。
// 今のインスタンスに無いコマンドの行も受けて残す（プラグインを戻せばまた効く）
export const SET_KEYS = kit.defineAction({
  id: "settings-keys",
  aiDescription:
    "Replace the user's changes to the shortcut keys as a whole: added are the rows added to the defaults, removed the default rows taken away. Read them first with read_settings and give them back with your change, or the other changes are lost.",
  title: "Shortcut keys",
  target: "settings",
  args: KeyChangesSchema,
  run: (settings, args) => ({ next: { ...settings, keys: args }, result: {} }),
})
