// 利用者の設定: 利用者の設定の項目の id → 値。ブックのデータではなく、変えるのは対象 settings のアクション（使えるかはホームのブックのタイプが決める）。
// 項目はプラグインの userSettings が持つ（core/def/setting.ts）。機能台帳に無い項目・今の形に合わない値も捨てずに残し（プラグインを戻せばまた効く）、読むときに形に合わなければ既定を使う
import { z } from "zod"
import type { CoreCatalog } from "./core-catalog"
import type { SettingDef, SettingRole } from "./def/setting"
import type { Lang } from "./i18n/i18n"
import { type KeyChanges, KeyChangesSchema, NO_KEY_CHANGES } from "./keys"

export type Settings = Readonly<Record<string, unknown>>
export const NO_SETTINGS: Settings = {}

// 残しておいた設定（外から来る値）を読む。項目の id → 値の形でなければ、何も持たない
export function restoreSettings(saved: unknown): Settings {
  const parsed = z.record(z.string(), z.unknown()).safeParse(saved)
  return parsed.success ? parsed.data : NO_SETTINGS
}

// 項目の値の形（機能台帳から組み立てた形か、schema）
export const settingSchema = (catalog: CoreCatalog, def: SettingDef): z.ZodType => def.describe?.(catalog) ?? def.schema

// 利用者の設定の項目 id の値。値が無いか形に合わなければ既定（既定も無い・機能台帳に無い項目なら undefined）
export function userSetting(catalog: CoreCatalog, settings: Settings, id: string): unknown {
  const def = catalog.userSettings.get(id)
  if (!def) return undefined
  const parsed = id in settings ? settingSchema(catalog, def).safeParse(settings[id]) : undefined
  return parsed?.success ? parsed.data : def.default
}

const byRole = (catalog: CoreCatalog, settings: Settings, role: SettingRole): unknown => {
  const def = catalog.roles.get(role)
  return def ? userSetting(catalog, settings, def.id) : undefined
}

// 今の言語: role が lang の項目が選んだ言語パックの言語。選んでいない・使えなければ fallback（インスタンスを作ったときに決めた言語）
export function langOf(catalog: CoreCatalog, settings: Settings, fallback: Lang): Lang {
  const pack = byRole(catalog, settings, "lang")
  return (typeof pack === "string" ? catalog.languagePacks.get(pack)?.lang : undefined) ?? fallback
}

// 今のスキン: role が skin の項目の値（スキンの id か、OS の明暗に合わせる "auto"）。無ければ "auto"
export function skinOf(catalog: CoreCatalog, settings: Settings): string {
  const skin = byRole(catalog, settings, "skin")
  return typeof skin === "string" ? skin : "auto"
}

// キーの割り当ての、利用者の変更: role が keys の項目の値。無ければ変更なし
export function keyChangesOf(catalog: CoreCatalog, settings: Settings): KeyChanges {
  const parsed = KeyChangesSchema.safeParse(byRole(catalog, settings, "keys"))
  return parsed.success ? parsed.data : NO_KEY_CHANGES
}

// AI に見せる設定: 機能台帳にある、利用者だけが変える項目でない項目の値（値が無いか形に合わなければ既定。既定も無ければ出さない）
export function aiSettings(catalog: CoreCatalog, settings: Settings): Settings {
  return Object.fromEntries(
    [...catalog.userSettings.values()]
      .filter(d => !d.userOnly)
      .flatMap(d => {
        const value = userSetting(catalog, settings, d.id)
        return value === undefined ? [] : [[d.id, value]]
      }),
  )
}
