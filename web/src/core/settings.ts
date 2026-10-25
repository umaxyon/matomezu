// 見る人ごとの設定。ブックのデータではなく、変えるのは対象 settings のアクション（使えるかはホームのブックのタイプが決める）
import { z } from "zod"
import type { CoreCatalog } from "./core-catalog"
import type { Lang } from "./i18n/i18n"
import { type KeyChanges, KeyChangesSchema } from "./keys"

// keys は配置と別の段に持つ（配置を替えても残る）
export interface Settings {
  lang: Lang
  skin: string // スキンの id。"auto" なら OS の明暗に合わせる
  keys: KeyChanges // キーの割り当ての、利用者の変更
}

// 残しておいた設定を、このインスタンスで使える項目だけ start に重ねる（無い言語・無いスキン・形の合わない値は捨てる）。
// 残した設定は外から来る値なので、形を確かめてから使う
export function restoreSettings(catalog: CoreCatalog, start: Settings, saved: unknown): Settings {
  const parsed = SavedSettingsSchema.safeParse(saved)
  if (!parsed.success) return start
  const { lang, skin, keys } = parsed.data
  return {
    lang: lang !== undefined && catalog.languages.has(lang) ? lang : start.lang,
    skin: skin !== undefined && (skin === "auto" || catalog.skins.has(skin)) ? skin : start.skin,
    keys: keys ?? start.keys,
  }
}

const SavedSettingsSchema = z.looseObject({
  lang: z.string().optional().catch(undefined),
  skin: z.string().optional().catch(undefined),
  keys: KeyChangesSchema.optional().catch(undefined),
})
