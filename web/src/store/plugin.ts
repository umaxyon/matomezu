// プラグイン: 1 つの部品の定義の組（ブックのタイプ・アイテム・アクション・テーマ・紙・コマンド・ダイアログ・キーの既定の割り当て）。React を使わない部分だけを持つ。
// インスタンスは渡されたプラグインを assemble で 機能台帳（Assembled の catalog）にし、作った後は変えない

import { type CorePart, PARTS, type Part, type PartDefTable, partsOf } from "../core/catalog"
import { buildCoreCatalog, type CoreCatalog, type CoreCatalogParts } from "../core/core-catalog"
import type { ShapeAddArgs, ShapeEditArgs } from "../core/def/item"
import type { Scheme } from "../core/def/skin"
import { fail, matomezuError, problem } from "../core/errors"
import type { LanguagePack, MessageSet } from "../core/i18n/messages"
import { normalizeKey } from "../core/keys"
import { type AutoSkin, autoSkin } from "../core/skin"
import type { CommandDef } from "./commands/def"
import type { DialogDef, DialogTaking } from "./dialogs"
import type { DefaultKey, KeyDef } from "./keys"

// store の段の定義の種類の、定義の型（ダイアログを開くときに渡す値の型は、ダイアログごとに違う）
declare module "../core/catalog" {
  interface PartDefTable {
    commands: CommandDef<never>
    dialogs: DialogDef<unknown>
  }
}

// プラグインが持つ定義: 定義の種類ごとの並び（core/catalog.ts の PARTS）と、文言・言語・キーの既定の割り当て
export type PluginParts = { readonly [K in Part]?: readonly PartDefTable[K][] } & {
  messages?: MessageSet // このプラグインの文言（defineMessages で書き、機能台帳の型の側 MessageTable に書き足す）
  languages?: readonly LanguagePack[] // 持ち込む言語（defineLanguagePack。ほかのプラグインの文言の訳も持てる）
  keys?: readonly KeyDef[] // キーの既定の割り当て（結べるのは自分のコマンドだけ。store/keys.ts）
}

export type Plugin = PluginParts & {
  id: string // npm のパッケージ名。足す定義の id は、どれも頭に「この id と /」を付ける
}

// プラグインが持つ、その種類の id
export type IdsOf<P, K extends Part> = P extends { [k in K]?: readonly (infer D)[] }
  ? D extends { id: infer I extends string }
    ? I
    : never
  : never

// 頭に「プラグインの id と /」が付いていない id と文言の鍵、英語の文（en）を持たない文言の鍵
type MessagesOf<P> = P extends { messages?: infer M }
  ? M extends object
    ? M
    : Record<never, never>
  : Record<never, never>
type NoEnglish<P> = {
  [K in keyof MessagesOf<P>]: MessagesOf<P>[K] extends { en: string } ? never : K
}[keyof MessagesOf<P>]
type Unprefixed<P extends Plugin> =
  | { [K in Part]: Exclude<IdsOf<P, K>, `${P["id"]}/${string}`> }[Part]
  | Exclude<keyof MessagesOf<P> & string, `${P["id"]}/${string}`>
  | (NoEnglish<P> & string)
type PrefixCheck<P extends Plugin> = [Unprefixed<P>] extends [never]
  ? unknown
  : { [id in Unprefixed<P>]: "id と文言の鍵の頭にプラグインの id と / を付け、文言は英語の文（en）を持つ" }

// 形の定義が名指すダイアログのうち、受ける値が ShapeAddArgs（追加）・ShapeEditArgs（編集）でないもの
type ShapeDialogsOf<P> = P extends { items?: readonly (infer D)[] }
  ? D extends { kind: "shape"; dialogs?: infer G }
    ? NonNullable<G>
    : never
  : never
type AddOf<G> = G extends { add: infer A } ? A : never
type EditOf<G> = G extends { edit: infer E } ? E : never
type WrongAdd<P> = Exclude<AddOf<ShapeDialogsOf<P>>, DialogTaking<ShapeAddArgs> | undefined>
type WrongEdit<P> = Exclude<EditOf<ShapeDialogsOf<P>>, DialogTaking<ShapeEditArgs> | undefined>
type ShapeDialogCheck<P> = [WrongAdd<P> | WrongEdit<P>] extends [never]
  ? unknown
  : {
      [id in (WrongAdd<P> | WrongEdit<P>) &
        string]: "形の追加のダイアログは ShapeAddArgs、編集のダイアログは ShapeEditArgs を受ける"
    }

// 追加プラグインを書く入口。id の頭と、形が名指すダイアログの受ける値を型で確かめる（組み立てでも確かめる）
export const definePlugin = <const P extends Plugin>(plugin: P & PrefixCheck<P> & ShapeDialogCheck<P>): P => plugin

// ビルトインプラグインは、頭の無い短い id を使う（「/」を含まない id はビルトインプラグインだけのもの）。
// 印は symbol の項目に持つ（見た目を結ぶときなど、プラグインを写しても印が残る）
const BUILTIN_MARK = Symbol("matomezu.builtin")
export function defineBuiltin<const P extends Plugin>(plugin: P & ShapeDialogCheck<P>): P {
  return Object.assign(plugin, { [BUILTIN_MARK]: true })
}
export const isBuiltin = (p: Plugin) => (p as { [BUILTIN_MARK]?: boolean })[BUILTIN_MARK] === true

// 機能台帳の store の段: コマンド・ダイアログ・キーの既定の割り当て
export interface StoreCatalog {
  commands: ReadonlyMap<string, CommandDef<never>>
  dialogs: ReadonlyMap<string, DialogDef<unknown>>
  keys: readonly DefaultKey[] // キーの既定の割り当て（キーはそろえた書き方）
}

// インスタンスが持つ機能台帳（core と store の段。ui の段は画面が持つ）
export interface Catalog {
  core: CoreCatalog
  store: StoreCatalog
}

// 組み立てたもの: 機能台帳と、組み立てで決まる値
export interface Assembled {
  catalog: Catalog
  home: string | null // インスタンスのホームのブックの id（1 冊だけのタイプ。無ければ null）
  autoSkin: AutoSkin | null // 自動のスキンで使う明と暗のスキン（スキンが無ければ null）
}

// プラグインを 1 つの表にする。id の頭・同じ id の重なり・表どうしの参照・ホームが 1 冊だけのタイプか・自動のスキンの明暗を確かめ、食い違いがあれば作らない
export function assemble(
  plugins: readonly Plugin[],
  home: string | null = null,
  auto: Partial<Record<Scheme, string>> = {},
): Assembled {
  for (const p of plugins) {
    if (isBuiltin(p)) continue
    for (const kind of Object.keys(PARTS) as Part[])
      for (const d of p[kind] ?? []) if (!d.id.startsWith(`${p.id}/`)) fail("E301", { plugin: p.id, kind, id: d.id })
    for (const [key, t] of Object.entries(p.messages ?? {})) {
      if (!key.startsWith(`${p.id}/`)) fail("E303", { plugin: p.id, key })
      if (t.en === undefined) fail("E304", { plugin: p.id, key })
    }
  }
  const all = <K extends Part>(kind: K) => plugins.flatMap(p => (p[kind] ?? []) as readonly PartDefTable[K][])
  const commands = all("commands")
  const dialogs = all("dialogs")
  // core の段の種類の重なりは buildCoreCatalog が確かめる
  const problems = partsOf("store").flatMap(k =>
    duplicates(
      PARTS[k].label,
      all(k).map(d => d.id),
    ),
  )
  const dialogIds = new Set(dialogs.map(d => d.id))
  for (const i of all("items"))
    if (i.kind === "shape")
      for (const dialog of [i.dialogs?.add, i.dialogs?.edit])
        if (dialog !== undefined && !dialogIds.has(dialog)) problems.push(problem("E026", { id: i.id, dialog }))
  if (problems.length > 0) throw matomezuError(problem("E016", { count: problems.length }), problems)
  const catalog = buildCoreCatalog({
    ...(Object.fromEntries(partsOf("core").map(k => [k, all(k)])) as unknown as Pick<CoreCatalogParts, CorePart>),
    messages: plugins.flatMap(p => (p.messages ? [p.messages] : [])),
    languages: plugins.flatMap(p => p.languages ?? []),
  })
  // コマンドの名前も文言の表から引く
  const untitled = commands
    .filter(c => !catalog.messages.has(c.title))
    .map(c => problem("E018", { kind: "command", id: c.id, title: c.title }))
  if (untitled.length > 0) throw matomezuError(problem("E016", { count: untitled.length }), untitled)
  const keys = defaultKeys(plugins, new Set(commands.map(c => c.id)))
  if (home !== null && catalog.bookTypes.get(home)?.single !== true) fail("E110", { id: home })
  return {
    catalog: {
      core: catalog,
      store: { commands: new Map(commands.map(c => [c.id, c])), dialogs: new Map(dialogs.map(d => [d.id, d])), keys },
    },
    home,
    autoSkin: autoSkin(catalog, auto),
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
