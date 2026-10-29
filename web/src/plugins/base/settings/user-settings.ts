// 利用者の設定の項目のうち、土台が読むもの: 言語・スキン・キーの割り当ての、利用者の変更（役で引かれる）。と、言語の項目で選んでいるパックを求める関数
import { z } from "zod"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { Lang } from "../../../core/i18n/i18n"
import { KeyChangesSchema, NO_KEY_CHANGES } from "../../../core/keys"
import { kit } from "../kit"

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
