// 利用者の設定: 利用者の設定の項目の id → 値。ブックのデータではなく、変えるのは対象 settings のアクション（使えるかはコントロールセンターが決める）。
// 項目はプラグインの userSettings が持つ（core/def/setting.ts）。機能台帳に無い項目・今の形に合わない値も捨てずに残し（プラグインを戻せばまた効く）、読むときに形に合わなければ既定を使う
import { z } from "zod"
import type { CoreCatalog } from "./core-catalog"
import type { SettingDef, SettingOwner, SettingRole } from "./def/setting"
import type { Lang } from "./i18n/i18n"
import { type KeyChanges, readKeyChanges } from "./keys"

export type Settings = Readonly<Record<string, unknown>>
export const NO_SETTINGS: Settings = {}

// 残しておいた設定（外から来る値）を読む。項目の id → 値の形でなければ、何も持たない
export function restoreSettings(saved: unknown): Settings {
  const parsed = z.record(z.string(), z.unknown()).safeParse(saved)
  return parsed.success ? parsed.data : NO_SETTINGS
}

// 項目の値の形（of の項目として機能台帳から組み立てた形か、schema）
export const settingSchema = (catalog: CoreCatalog, def: SettingDef, of: SettingOwner): z.ZodType =>
  def.describe?.(catalog, of) ?? def.schema

// 利用者の設定の項目 id の値。値が無いか形に合わなければ既定（既定も無い・機能台帳に無い項目なら undefined）
export function userSetting(catalog: CoreCatalog, settings: Settings, id: string): unknown {
  const def = catalog.userSettings.get(id)
  if (!def) return undefined
  const parsed = id in settings ? settingSchema(catalog, def, "user").safeParse(settings[id]) : undefined
  return parsed?.success ? parsed.data : def.default
}

const byRole = (catalog: CoreCatalog, settings: Settings, role: SettingRole): unknown => {
  const def = catalog.roles.get(role)
  return def ? userSetting(catalog, settings, def.id) : undefined
}

// 言語を選んでいるか: role が lang の項目に値が在る（機能台帳に無い言語パックの値も、選んだ物として残す）
export function langChosen(catalog: CoreCatalog, settings: Settings): boolean {
  const def = catalog.roles.get("lang")
  return def !== undefined && def.id in settings
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

// キーバインドの、利用者の変更: role が keys の項目の値。無ければ変更なし
export function keyChangesOf(catalog: CoreCatalog, settings: Settings): KeyChanges {
  return readKeyChanges(byRole(catalog, settings, "keys"))
}

// 参加者が「生きている」とする長さ（ミリ秒）: role が participant-alive の項目の値（分の数。形に合わない値は項目の既定）。項目が無いか数でなければ 0（誰も生きていない）
export function participantAliveMs(catalog: CoreCatalog, settings: Settings): number {
  const minutes = Number(byRole(catalog, settings, "participant-alive"))
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : 0
}

// 無効の（利用者が有効にしていない）追加プラグインの id の集合: 追加プラグイン added のうち、role が enabled-plugins の項目の値（形に合わない値は無し）に無い物。
// ビルトインプラグインは追加プラグインに含めないので、いつも有効
export function disabledPluginsOf(
  catalog: CoreCatalog,
  settings: Settings,
  added: readonly string[],
): ReadonlySet<string> {
  const value = byRole(catalog, settings, "enabled-plugins")
  const enabled = new Set(Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [])
  return new Set(added.filter(id => !enabled.has(id)))
}

// ほかのホストとつなぐか: role が connect-hosts の項目の値が true（項目が無ければつながない）
export function connectHostsOn(catalog: CoreCatalog, settings: Settings): boolean {
  return byRole(catalog, settings, "connect-hosts") === true
}

// ホスト名: role が host-name の項目の、空でない値（無ければ undefined。読む側が OS のホスト名を使う）
export function hostNameOf(catalog: CoreCatalog, settings: Settings): string | undefined {
  const name = byRole(catalog, settings, "host-name")
  return typeof name === "string" && name.trim() !== "" ? name.trim() : undefined
}

// 利用者名: role が user-name の項目の、空白を除いた値（無ければ空）。ほかのホストに見せる
export function userNameOf(catalog: CoreCatalog, settings: Settings): string {
  const name = byRole(catalog, settings, "user-name")
  return typeof name === "string" ? name.trim() : ""
}

// AI 用ホストリストに載せる、このホストのワークルーム: 全部（all）か、様子が最近変わった物だけ（recent）。role が listed-workrooms の項目の値（無いか形に合わなければ all）
export const LISTED_WORKROOMS = ["all", "recent"] as const
export function listedWorkroomsOf(catalog: CoreCatalog, settings: Settings): (typeof LISTED_WORKROOMS)[number] {
  return byRole(catalog, settings, "listed-workrooms") === "recent" ? "recent" : "all"
}

// 常駐が新しい版を自分で確かめるか: role が update-check の項目の値が true（項目が無ければ確かめない）
export function updateCheckOn(catalog: CoreCatalog, settings: Settings): boolean {
  return byRole(catalog, settings, "update-check") === true
}

// 参加者が時点 nowMs で生きているか: 最後に呼ばれた時刻 calledAt（無ければ呼ばれていない）から、有効時間の設定以内。画面もホスト（エンジン経由）もこれで決める
export function isParticipantAlive(
  catalog: CoreCatalog,
  settings: Settings,
  calledAt: string | undefined,
  nowMs: number,
): boolean {
  if (!calledAt) return false
  const at = Date.parse(calledAt)
  return !Number.isNaN(at) && nowMs - at < participantAliveMs(catalog, settings)
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
