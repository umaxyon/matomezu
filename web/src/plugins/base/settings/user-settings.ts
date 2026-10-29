// 利用者の設定の項目のうち、土台が読むもの: 言語・スキン・キーの割り当ての、利用者の変更（role で引かれる）。と、言語の項目で選んでいるパックと、設定の画面が値の形から作る入力Form を求める関数
import { z } from "zod"
import type { CatalogCheck, CoreCatalog } from "../../../core/core-catalog"
import type { SettingDef } from "../../../core/def/setting"
import { problem } from "../../../core/errors"
import type { Lang } from "../../../core/i18n/i18n"
import { KeyChangesSchema, NO_KEY_CHANGES } from "../../../core/keys"
import { settingSchema } from "../../../core/settings"
import { kit } from "../kit"

declare module "../../../core/catalog" {
  interface SettingExtras {
    // 値の形が選択肢の利用者の設定の項目で、選択肢の値 → 名前（頭の付いた文言の鍵。kit.message で作る）。設定の画面が選択肢に出す（無い値は、値をそのまま出す）
    optionTitles?: Readonly<Record<string, string>>
  }
}

// 言語: 言語パックの id（選んでいなければ、インスタンスを作ったときに決めた言語）
export const LANG = kit.defineSetting({
  id: "lang",
  title: "Language",
  schema: z.string().min(1),
  role: "lang",
  describe: catalog => z.enum([...catalog.languagePacks.keys()] as [string, ...string[]]),
})

// スキン: スキンの id か、OS の明暗に合わせる "auto"
export const SKIN = kit.defineSetting({
  id: "skin",
  title: "Skin",
  schema: z.string().min(1),
  default: "auto",
  role: "skin",
  describe: catalog => z.enum(["auto", ...catalog.skins.keys()]),
})

// キーの割り当ての、利用者の変更（足した行・外した既定の行）。今のインスタンスに無いコマンドの行も残す（プラグインを戻せばまた効く）
export const KEYS = kit.defineSetting({
  id: "keys",
  title: "Shortcut keys",
  schema: KeyChangesSchema,
  default: NO_KEY_CHANGES,
  role: "keys",
})

// 言語の項目で選んでいる言語パック: 選んだパックか、選んでいない・使えなければ今の言語 lang のパック
export function shownLanguagePack(catalog: CoreCatalog, settings: Readonly<Record<string, unknown>>, lang: Lang) {
  const chosen = settings[LANG.id]
  if (typeof chosen === "string" && catalog.languagePacks.has(chosen)) return chosen
  return [...catalog.languagePacks.values()].find(p => p.lang === lang)?.id
}

// 項目のビューが無い項目に、設定の画面が値の形から作る入力Form: 真偽はスイッチ、選択肢はセレクトForm、数と文字はテキストForm。作れない形なら null
export type AutoInput =
  | { kind: "switch" }
  | { kind: "select"; options: readonly string[] }
  | { kind: "number" }
  | { kind: "text" }

export function autoInputOf(catalog: CoreCatalog, def: SettingDef): AutoInput | null {
  const schema = settingSchema(catalog, def)
  if (schema instanceof z.ZodBoolean) return { kind: "switch" }
  if (schema instanceof z.ZodEnum) return { kind: "select", options: schema.options.map(String) }
  if (schema instanceof z.ZodNumber) return { kind: "number" }
  if (schema instanceof z.ZodString) return { kind: "text" }
  return null
}

// optionTitles の文言の鍵が文言にあるか（組み立てのときの確かめ）
export const OPTION_TITLES_CHECK: CatalogCheck = catalog =>
  [...catalog.userSettings.values()].flatMap(d =>
    Object.values(d.optionTitles ?? {})
      .filter(title => !catalog.messages.has(title))
      .map(title => problem("E018", { kind: "userSetting", id: d.id, title })),
  )
