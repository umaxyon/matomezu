// 見る人ごとの設定。ブックのデータではなく、変えるのは対象 settings のアクション（使えるかはホームのブックのタイプが決める）
import { z } from "zod"
import { HEX } from "./color"
import type { CoreCatalog } from "./core-catalog"
import type { Lang } from "./i18n/i18n"
import { type KeyChanges, KeyChangesSchema } from "./keys"

// keys は配置と別の段に持つ（配置を替えても残る）
export interface Settings {
  lang: Lang
  skin: string // スキンの id。"auto" なら OS の明暗に合わせる
  keys: KeyChanges // キーの割り当ての、利用者の変更
  textColors: Readonly<Record<string, string>> // 文字の色の、見る人の上書き（文字の色の id → #rrggbb）
}

// 文字の色の上書き（機能台帳に無い色の id も残す。プラグインを戻せばまた効く）
export const TextColorsSchema = z.record(z.string(), z.string().regex(HEX))
export const NO_TEXT_COLORS: Readonly<Record<string, string>> = {}

// 残しておいた設定を、このインスタンスで使える項目だけ start に重ねる（無い言語・無いスキン・形の合わない値は捨てる）。
// 残した設定は外から来る値なので、形を確かめてから使う
export function restoreSettings(catalog: CoreCatalog, start: Settings, saved: unknown): Settings {
  const parsed = SavedSettingsSchema.safeParse(saved)
  if (!parsed.success) return start
  const { lang, skin, keys, textColors } = parsed.data
  return {
    lang: lang !== undefined && catalog.languages.has(lang) ? lang : start.lang,
    skin: skin !== undefined && (skin === "auto" || catalog.skins.has(skin)) ? skin : start.skin,
    keys: keys ?? start.keys,
    textColors: textColors ?? start.textColors,
  }
}

const SavedSettingsSchema = z.looseObject({
  lang: z.string().optional().catch(undefined),
  skin: z.string().optional().catch(undefined),
  keys: KeyChangesSchema.optional().catch(undefined),
  textColors: TextColorsSchema.optional().catch(undefined),
})
