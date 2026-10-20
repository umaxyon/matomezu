// プラグイン: 1 つの部品の定義の組（ブックのタイプ・アイテム・アクション・テーマ・紙・コマンド・ダイアログ）。React を使わない部分だけを持つ。
// app は渡されたプラグインを assemble で 1 つの定義の表（AppDefs）にし、作った後は変えない
import type { ActionDef } from "../core/def/action"
import type { BookTypeDef } from "../core/def/book-type"
import type { ItemDef } from "../core/def/item"
import type { PaperDef } from "../core/def/paper"
import type { ThemeDef } from "../core/def/theme"
import { fail, matomezuError, problem } from "../core/errors"
import type { MessageSet } from "../core/i18n/messages"
import { buildRegistry, type Registry } from "../core/registry"
import type { CommandDef } from "./commands/def"
import type { DialogDef } from "./dialogs"

export interface PluginParts {
  bookTypes?: readonly BookTypeDef[]
  items?: readonly ItemDef[]
  actions?: readonly ActionDef[]
  themes?: readonly ThemeDef[]
  papers?: readonly PaperDef[]
  commands?: readonly CommandDef<never>[]
  dialogs?: readonly DialogDef[]
  messages?: MessageSet // このプラグインの文言（defineMessages で書き、型の表 MessageTable に書き足す）
}
export type Part = Exclude<keyof PluginParts, "messages">
export const PARTS: readonly Part[] = ["bookTypes", "items", "actions", "themes", "papers", "commands", "dialogs"]

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

// 外のプラグインを書く入口。id の頭を型で確かめる（組み立てでも確かめる）
export const definePlugin = <const P extends Plugin>(plugin: P & PrefixCheck<P>): P => plugin

// 中の部品は、頭の無い短い id を使う（「/」を含まない id は中の部品だけのもの）。
// 印は symbol の項目に持つ（見た目を結ぶときなど、プラグインを写しても印が残る）
const BUILTIN_MARK = Symbol("matomezu.builtin")
export function defineBuiltin<const P extends Plugin>(plugin: P): P {
  return Object.assign(plugin, { [BUILTIN_MARK]: true })
}
export const isBuiltin = (p: Plugin) => (p as { [BUILTIN_MARK]?: boolean })[BUILTIN_MARK] === true

// app が使う定義の表
export interface AppDefs {
  registry: Registry
  commands: ReadonlyMap<string, CommandDef<never>>
  dialogs: ReadonlySet<string>
}

// プラグインを 1 つの表にする。id の頭・同じ id の重なり・表どうしの参照を確かめ、食い違いがあれば作らない
export function assemble(plugins: readonly Plugin[]): AppDefs {
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
  if (problems.length > 0) throw matomezuError(problem("E016", { count: problems.length }), problems)
  const registry = buildRegistry({
    bookTypes: all("bookTypes"),
    items: all("items"),
    actions: all("actions"),
    themes: all("themes"),
    papers: all("papers"),
    messages: plugins.flatMap(p => (p.messages ? [p.messages] : [])),
  })
  // コマンドの名前も文言の表から引く
  const untitled = commands
    .filter(c => !registry.messages.has(c.title))
    .map(c => problem("E018", { kind: "command", id: c.id, title: c.title }))
  if (untitled.length > 0) throw matomezuError(problem("E016", { count: untitled.length }), untitled)
  return {
    registry,
    commands: new Map(commands.map(c => [c.id, c])),
    dialogs: new Set(dialogs.map(d => d.id)),
  }
}

function duplicates(kind: string, ids: readonly string[]) {
  const seen = new Set<string>()
  return ids.filter(id => seen.has(id) || !seen.add(id)).map(id => problem("E001", { kind, id }))
}
