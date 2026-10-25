// プラグイン: 1 つの部品の定義の組（ブックのタイプ・アイテム・アクション・テーマ・紙・コマンド・ダイアログ・キーの既定の割り当て）。React を使わない部分だけを持つ。
// インスタンスは渡されたプラグインを assemble で 1 つの定義の表（AppDefs）にし、作った後は変えない

import { buildCoreCatalog, type CoreCatalog } from "../core/core-catalog"
import type { ActionDef } from "../core/def/action"
import type { BookTypeDef } from "../core/def/book-type"
import type { ItemDef } from "../core/def/item"
import type { PaperDef } from "../core/def/paper"
import type { PresentationDef } from "../core/def/presentation"
import type { SettingDef } from "../core/def/setting"
import type { Scheme, SkinDef } from "../core/def/skin"
import type { ThemeDef } from "../core/def/theme"
import { fail, matomezuError, problem } from "../core/errors"
import type { LanguagePack, MessageSet } from "../core/i18n/messages"
import { normalizeKey } from "../core/keys"
import { type AutoSkin, autoSkin } from "../core/skin"
import type { CommandDef } from "./commands/def"
import type { DialogDef } from "./dialogs"
import type { DefaultKey, KeyDef } from "./keys"

export interface PluginParts {
  bookTypes?: readonly BookTypeDef[]
  items?: readonly ItemDef[]
  actions?: readonly ActionDef[]
  settings?: readonly SettingDef[]
  presentations?: readonly PresentationDef[]
  themes?: readonly ThemeDef[]
  papers?: readonly PaperDef[]
  skins?: readonly SkinDef[]
  commands?: readonly CommandDef<never>[]
  dialogs?: readonly DialogDef<unknown>[] // 開くときに渡す値の型は、ダイアログごとに違う
  messages?: MessageSet // このプラグインの文言（defineMessages で書き、型の表 MessageTable に書き足す）
  languages?: readonly LanguagePack[] // 持ち込む言語（defineLanguagePack。ほかのプラグインの文言の訳も持てる）
  keys?: readonly KeyDef[] // キーの既定の割り当て（結べるのは自分のコマンドだけ。store/keys.ts）
}
export type Part = Exclude<keyof PluginParts, "messages" | "languages" | "keys">
export const PARTS: readonly Part[] = [
  "bookTypes",
  "items",
  "actions",
  "settings",
  "presentations",
  "themes",
  "papers",
  "skins",
  "commands",
  "dialogs",
]

export interface Plugin extends PluginParts {
  id: string // npm のパッケージ名。足す定義の id は、どれも頭に「この id と /」を付ける
}

// プラグインが持つ、その種類の id
export type IdsOf<P, K extends Part> = P extends { [k in K]?: readonly (infer D)[] }
  ? D extends { id: infer I extends string }
    ? I
    : never
  : never

// 頭に「プラグインの id と /」が付いていない id
type Unprefixed<P extends Plugin> = { [K in Part]: Exclude<IdsOf<P, K>, `${P["id"]}/${string}`> }[Part]
type PrefixCheck<P extends Plugin> = [Unprefixed<P>] extends [never]
  ? unknown
  : { [id in Unprefixed<P>]: "id の頭にプラグインの id と / を付ける" }

// 追加プラグインを書く入口。id の頭を型で確かめる（組み立てでも確かめる）
export const definePlugin = <const P extends Plugin>(plugin: P & PrefixCheck<P>): P => plugin

// ビルトインプラグインは、頭の無い短い id を使う（「/」を含まない id はビルトインプラグインだけのもの）。
// 印は symbol の項目に持つ（見た目を結ぶときなど、プラグインを写しても印が残る）
const BUILTIN_MARK = Symbol("matomezu.builtin")
export function defineBuiltin<const P extends Plugin>(plugin: P): P {
  return Object.assign(plugin, { [BUILTIN_MARK]: true })
}
export const isBuiltin = (p: Plugin) => (p as { [BUILTIN_MARK]?: boolean })[BUILTIN_MARK] === true

// インスタンスが使う定義の表
export interface AppDefs {
  registry: CoreCatalog
  home: string | null // インスタンスのホームのブックの id（1 冊だけのタイプ。無ければ null）
  autoSkin: AutoSkin | null // 自動のスキンで使う明と暗のスキン（スキンが無ければ null）
  commands: ReadonlyMap<string, CommandDef<never>>
  dialogs: ReadonlySet<string>
  keys: readonly DefaultKey[] // キーの既定の割り当て（キーはそろえた書き方）
}

// プラグインを 1 つの表にする。id の頭・同じ id の重なり・表どうしの参照・ホームが 1 冊だけのタイプか・自動のスキンの明暗を確かめ、食い違いがあれば作らない
export function assemble(
  plugins: readonly Plugin[],
  home: string | null = null,
  auto: Partial<Record<Scheme, string>> = {},
): AppDefs {
  for (const p of plugins) {
    if (isBuiltin(p)) continue
    for (const kind of PARTS)
      for (const d of p[kind] ?? []) if (!d.id.startsWith(`${p.id}/`)) fail("E301", { plugin: p.id, kind, id: d.id })
  }
  const all = <K extends Part>(kind: K) =>
    plugins.flatMap(p => (p[kind] ?? []) as NonNullable<PluginParts[K]>[number][])
  const commands = all("commands")
  const dialogs = all("dialogs")
  const problems = [
    ...duplicates(
      "command",
      commands.map(c => c.id),
    ),
    ...duplicates(
      "dialog",
      dialogs.map(d => d.id),
    ),
  ]
  const dialogIds = new Set(dialogs.map(d => d.id))
  for (const i of all("items"))
    if (i.kind === "shape")
      for (const dialog of [i.dialogs.add, i.dialogs.edit])
        if (!dialogIds.has(dialog)) problems.push(problem("E026", { id: i.id, dialog }))
  if (problems.length > 0) throw matomezuError(problem("E016", { count: problems.length }), problems)
  const registry = buildCoreCatalog({
    bookTypes: all("bookTypes"),
    items: all("items"),
    actions: all("actions"),
    settings: all("settings"),
    presentations: all("presentations"),
    themes: all("themes"),
    papers: all("papers"),
    skins: all("skins"),
    messages: plugins.flatMap(p => (p.messages ? [p.messages] : [])),
    languages: plugins.flatMap(p => p.languages ?? []),
  })
  // コマンドの名前も文言の表から引く
  const untitled = commands
    .filter(c => !registry.messages.has(c.title))
    .map(c => problem("E018", { kind: "command", id: c.id, title: c.title }))
  if (untitled.length > 0) throw matomezuError(problem("E016", { count: untitled.length }), untitled)
  const keys = defaultKeys(plugins, new Set(commands.map(c => c.id)))
  if (home !== null && registry.bookTypes.get(home)?.single !== true) fail("E110", { id: home })
  return {
    registry,
    home,
    autoSkin: autoSkin(registry, auto),
    commands: new Map(commands.map(c => [c.id, c])),
    dialogs: new Set(dialogs.map(d => d.id)),
    keys,
  }
}

// プラグインの既定の割り当てを集める。読めないキー・無いコマンド・追加プラグインがほかのコマンドに結んだ行・ビルトインプラグインどうしで同じ範囲の同じキーは誤り
function defaultKeys(plugins: readonly Plugin[], commands: ReadonlySet<string>): DefaultKey[] {
  const keys: DefaultKey[] = []
  const problems = []
  for (const p of plugins) {
    const own = new Set((p.commands ?? []).map(c => c.id))
    for (const k of p.keys ?? []) {
      const key = normalizeKey(k.key)
      if (!key) problems.push(problem("E022", { key: k.key, command: k.command }))
      else if (!commands.has(k.command)) problems.push(problem("E024", { key: k.key, command: k.command }))
      else if (!isBuiltin(p) && !own.has(k.command))
        problems.push(problem("E302", { plugin: p.id, key: k.key, command: k.command }))
      else keys.push({ binding: { ...k, key }, plugin: p.id, builtin: isBuiltin(p) })
    }
  }
  const seen = new Set<string>()
  for (const k of keys.filter(k => k.builtin)) {
    const at = `${k.binding.scope} ${k.binding.key}`
    if (seen.has(at)) problems.push(problem("E023", { key: k.binding.key, scope: k.binding.scope }))
    seen.add(at)
  }
  if (problems.length > 0) throw matomezuError(problem("E016", { count: problems.length }), problems)
  return keys
}

function duplicates(kind: string, ids: readonly string[]) {
  const seen = new Set<string>()
  return ids.filter(id => seen.has(id) || !seen.add(id)).map(id => problem("E001", { kind, id }))
}
