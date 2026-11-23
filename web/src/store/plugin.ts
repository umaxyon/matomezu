// プラグイン: 1 つの部品の定義の組（定義の種類は core/catalog.ts の PARTS と、store の物（コマンド・ダイアログ・既定のキーバインドなど））。React を使わない部分だけを持つ。
// インスタンスは渡されたプラグインを assemble で 機能台帳（Assembled の catalog）にし、作った後は変えない

import {
  type ActionId,
  type ActionTable,
  type CorePart,
  type MessageKey,
  PARTS,
  type Part,
  type PartDefTable,
  partsOf,
} from "../core/catalog"
import { buildCoreCatalog, type CatalogCheckDef, type CoreCatalog, type CoreCatalogParts } from "../core/core-catalog"
import { NO_CONTROL_CENTER } from "../core/def/action"
import type { FollowStepDef } from "../core/def/follow-step"
import type { ShapeAddArgs, ShapeEditArgs } from "../core/def/item"
import type { LibraryAppearanceDef } from "../core/def/library-appearance"
import type { NormalizeStepDef } from "../core/def/normalize-step"
import type { PluginStateDef } from "../core/def/plugin-state"
import type { Scheme } from "../core/def/skin"
import type { TokenDef } from "../core/def/theme"
import { fail, matomezuError, type Problem, problem } from "../core/errors"
import type { LanguagePackDef, MessageSetDef } from "../core/i18n/messages"
import { normalizeKey } from "../core/keys"
import { isOwnedBy, splitId } from "../core/names"
import { type AutoSkin, autoSkin } from "../core/skin"
import { writtenValues } from "../core/theme"
import { type Warning, warning } from "../core/warnings"
import type { CommandDef } from "./commands/def"
import type { DialogDef, DialogTaking, NewPageDialogArgs, PageSettingsArgs } from "./dialogs"
import {
  BASE_KEY_SCOPES,
  type DefaultKey,
  findKey,
  type KeyDef,
  type KeyScopeCommandsFrom,
  type KeyScopeDef,
  keyTable,
} from "./keys"

// store 台帳の定義の種類の、定義の型（ダイアログを開くときに渡す値の型は、ダイアログごとに違う）
declare module "../core/catalog" {
  interface PartDefTable {
    commands: CommandDef<never>
    dialogs: DialogDef<unknown>
    keyScopes: KeyScopeDef
    pluginStates: PluginStateDef
    libraryAppearances: LibraryAppearanceDef
  }
}

// プラグインが持つ定義: 定義の種類ごとの並び（core/catalog.ts の PARTS）と、文言・言語・既定のキーバインド
export type PluginParts = { readonly [K in Part]?: readonly PartDefTable[K][] } & {
  messages?: MessageSetDef // このプラグインの文言（defineMessages で書いて pluginKit に渡し、core/catalog.ts の MessageTable に書き足す）
  languages?: readonly LanguagePackDef[] // 持ち込む言語（kit.defineLanguagePack。ほかのプラグインの文言の訳も持てる）
  keys?: readonly KeyDef[] // 既定のキーバインド（kit.defineKey。結べるのは自分のコマンドだけ。store/keys.ts）
  tokens?: readonly TokenDef[] // プラグインが持つテーマキー（そのプラグインのいくつものアイテムが共に使う。一つのアイテムだけが使うものはアイテムに書く）
  checks?: readonly CatalogCheckDef[] // 台帳アセンブルのときの確かめ（ビルトインプラグインだけ。追加プラグインは definePlugin の型と台帳アセンブル E308 で止める）
  normalizeSteps?: readonly NormalizeStepDef[] // ノーマライズステップ（core/def/normalize-step.ts。ビルトインプラグインだけ。追加プラグインは definePlugin の型と台帳アセンブル E310 で止める）
  followSteps?: readonly FollowStepDef[] // フォローステップ（core/def/follow-step.ts。追加プラグインも持てる）
}

export type Plugin = PluginParts & {
  id: string // npm のパッケージ名。足す物の id は、どれも「この id:名前」（pluginKit が頭を付ける。core/names.ts）
  title?: MessageKey // プラグインの名前（自分の文言の鍵。設定の「プラグイン」に出る。無ければ id）
  description?: MessageKey // プラグインの概要（自分の文言の鍵。設定の「プラグイン」で名前の下に出る）
}

// プラグインが持つ、その種類の id
export type IdsOf<P, K extends Part> = P extends { [k in K]?: readonly (infer D)[] }
  ? D extends { id: infer I extends string }
    ? I
    : never
  : never

// 頭に「プラグインの id と :」が付いていない id と文言の鍵、英語の文（en）を持たない文言の鍵
type MessagesOf<P> = P extends { messages?: { messages: infer M } }
  ? M extends object
    ? M
    : Record<never, never>
  : Record<never, never>
type NoEnglish<P> = {
  [K in keyof MessagesOf<P>]: MessagesOf<P>[K] extends { en: string } ? never : K
}[keyof MessagesOf<P>]
type Unprefixed<P extends Plugin> =
  | { [K in Part]: Exclude<IdsOf<P, K>, `${P["id"]}:${string}`> }[Part]
  | Exclude<keyof MessagesOf<P> & string, `${P["id"]}:${string}`>
  | (NoEnglish<P> & string)
type PrefixCheck<P extends Plugin> = [Unprefixed<P>] extends [never]
  ? unknown
  : {
      [id in Unprefixed<P>]: "id と文言の鍵の頭にプラグインの id と : を付け（pluginKit で定義する）、文言は英語の文（en）を持つ"
    }

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

// ページのタイプが名指すページを作るダイアログとページの設定のダイアログのうち、受ける値が合わないもの
// （ページを作るダイアログは NewPageDialogArgs を受け、ページの設定のダイアログは PageSettingsArgs）
type PageDialogsOf<P> = P extends { pageTypes?: readonly (infer T)[] }
  ? T extends { dialogs?: infer G }
    ? NonNullable<G>
    : never
  : never
type WrongPageAdd<P> = Exclude<AddOf<PageDialogsOf<P>>, DialogTaking<NewPageDialogArgs> | undefined>
type SettingsDialogOf<G> = G extends { settings: infer S } ? S : never
type WrongPageSettings<P> = Exclude<SettingsDialogOf<PageDialogsOf<P>>, DialogTaking<PageSettingsArgs> | undefined>
type PageDialogCheck<P> = [WrongPageAdd<P> | WrongPageSettings<P>] extends [never]
  ? unknown
  : {
      [id in (WrongPageAdd<P> | WrongPageSettings<P>) &
        string]: "ページを作るダイアログは NewPageDialogArgs を受け、ページの設定のダイアログは PageSettingsArgs を受ける"
    }

// ページのタイプが足す・外すアクション（actions の add・without）のうち、ブック自身だけを変えるアクション（許可スコープが "book"。どのページのタイプでも決まらないので、書けない）
type ContainerActionId = {
  [K in ActionId]: ActionTable[K] extends { permissionScope: "book" } ? K : never
}[ActionId]
type TypeActionsOf<P> = P extends { pageTypes?: readonly (infer T)[] }
  ? T extends { actions: infer C }
    ? (C extends { add: readonly (infer X)[] } ? X : never) | (C extends { without: readonly (infer Y)[] } ? Y : never)
    : never
  : never
type WrongTypeActions<P> = TypeActionsOf<P> & ContainerActionId
type TypeActionsCheck<P> = [WrongTypeActions<P>] extends [never]
  ? unknown
  : {
      [id in WrongTypeActions<P> &
        string]: "ブック自身だけを変えるアクション（許可スコープが book）は、ページのタイプの actions に書けない"
    }

// 無効にしたプラグイン: 名乗り（id・名前・概要）と文言だけを残し、定義の部品は全部外した物（組むのは名乗りと文言だけなので、アクション・種類・キーなどは台帳に入らない）。
// 外す（組み込みから除く）のとは違い、プラグインは組み込まれたまま、設定の「プラグイン」に並ぶ
export const withoutParts = <P extends Plugin>(p: P): Plugin => ({
  id: p.id,
  ...(p.title ? { title: p.title } : {}),
  ...(p.description ? { description: p.description } : {}),
  ...(p.messages ? { messages: p.messages } : {}),
})

// プラグインを書く入口。id の頭と、形とページのタイプが名指すダイアログの受ける値を型で確かめる（台帳アセンブルでも確かめる）
export const definePlugin = <const P extends Plugin>(
  plugin: P &
    PrefixCheck<P> &
    ShapeDialogCheck<P> &
    PageDialogCheck<P> &
    TypeActionsCheck<P> & { checks?: never; normalizeSteps?: never },
): P => plugin

// ビルトインプラグインが台帳アセンブルのときの確かめ（checks）を書くための型と、問題と warning の作り方、テーマキーに書かれた値の引き方（plugin-api/builtin が出し直す）
export type { CatalogCheckDef }
export { problem, warning, writtenValues }

// ビルトインプラグインの印: キーバインドで、ビルトインプラグインを先に扱う（id の決まりはほかのプラグインと同じ）。
// 印は symbol の項目に持つ（見た目を結ぶときなど、プラグインを写しても印が残る）
const BUILTIN_MARK = Symbol("matomezu.builtin")
export function defineBuiltin<const P extends Plugin>(
  plugin: P & PrefixCheck<P> & ShapeDialogCheck<P> & PageDialogCheck<P> & TypeActionsCheck<P>,
): P {
  return Object.assign(plugin, { [BUILTIN_MARK]: true })
}
export const isBuiltin = (p: Plugin) => (p as { [BUILTIN_MARK]?: boolean })[BUILTIN_MARK] === true

// store 台帳: コマンド・ダイアログ・キーの範囲・キーの既定のキーバインド
export interface StoreCatalog {
  commands: ReadonlyMap<string, CommandDef<never>>
  dialogs: ReadonlyMap<string, DialogDef<unknown>>
  keyScopes: ReadonlyMap<string, KeyScopeDef> // プラグインのキーの範囲（土台の範囲は入らない。題名と呼ぶコマンドは store/keys.ts の BASE_KEY_SCOPES）
  keys: ReadonlyMap<string, DefaultKey> // キーの既定のキーバインド（id → キーバインド。キーはそろえた書き方）
  libraryAppearances: ReadonlyMap<string, LibraryAppearanceDef> // 書庫アピアランス（id → 定義）
  pluginStates: ReadonlyMap<string, PluginStateDef> // プラグイン状態の宣言（id → 定義。store/plugin-state.ts）
  warnings: readonly Warning[] // 台帳アセンブルで見つけた、止めるほどではない間違い（コマンドの performs・キー・ビルトインプラグインの checks。core/warnings.ts）
}

// インスタンスが持つ機能台帳（core 台帳と store 台帳。ui 台帳は画面が持つ）
export interface Catalog {
  core: CoreCatalog
  store: StoreCatalog
}

// 台帳アセンブルしたもの: 機能台帳と、台帳アセンブルで決まる値
export interface Assembled {
  catalog: Catalog
  controlCenter: string | typeof NO_CONTROL_CENTER // インスタンスのコントロールセンターの定義の id（無ければ NO_CONTROL_CENTER）
  autoSkin: AutoSkin | null // 自動のスキンで使う明と暗のスキン（スキンが無ければ null）
}

// プラグインを 1 つの表にする。id の頭・同じ id の重なり・表どうしの参照・コントロールセンターが表にあるか・自動のスキンの明暗を確かめ、食い違いがあれば作らない
export function assemble(
  plugins: readonly Plugin[],
  controlCenter: string | typeof NO_CONTROL_CENTER = NO_CONTROL_CENTER,
  auto: Partial<Record<Scheme, string>> = {},
): Assembled {
  for (const p of plugins) {
    if (p.checks !== undefined && !isBuiltin(p)) fail("E308", { plugin: p.id })
    if (p.normalizeSteps !== undefined && !isBuiltin(p)) fail("E310", { plugin: p.id })
    if (p.controlCenters !== undefined && !isBuiltin(p)) fail("E311", { plugin: p.id })
    if (p.backyards !== undefined && !isBuiltin(p)) fail("E319", { plugin: p.id })
    for (const d of p.userSettings ?? []) if (d.role && !isBuiltin(p)) fail("E309", { plugin: p.id, id: d.id })
    for (const kind of Object.keys(PARTS) as Part[])
      for (const d of p[kind] ?? []) if (!isOwnedBy(p.id, d.id)) fail("E301", { plugin: p.id, kind, id: d.id })
    for (const t of [...(p.items ?? []), ...(p.pageTypes ?? [])].flatMap(o => o.tokens).concat(p.tokens ?? [])) {
      if (!isOwnedBy(p.id, t.id)) fail("E301", { plugin: p.id, kind: "token", id: t.id })
      if (/^(theme|skin)-/.test(splitId(t.id).name)) fail("E306", { plugin: p.id, token: t.id })
    }
    const own: [string, string][] = [
      ...(p.messages ? [["messages", p.messages.id] as [string, string]] : []),
      ...(p.languages ?? []).map(l => ["language", l.id] as [string, string]),
      ...(p.keys ?? []).map(k => ["key", k.id] as [string, string]),
    ]
    for (const [kind, id] of own) if (!isOwnedBy(p.id, id)) fail("E301", { plugin: p.id, kind, id })
    for (const [key, t] of Object.entries(p.messages?.messages ?? {})) {
      if (!key.startsWith(`${p.id}:`)) fail("E303", { plugin: p.id, key })
      if (t.en === undefined) fail("E304", { plugin: p.id, key })
    }
  }
  const all = <K extends Part>(kind: K) => plugins.flatMap(p => (p[kind] ?? []) as readonly PartDefTable[K][])
  const commands = all("commands")
  const dialogs = all("dialogs")
  const keyScopes = all("keyScopes")
  // core 台帳の種類の重なりは buildCoreCatalog が確かめる
  const problems = [
    ...partsOf("store").flatMap(k =>
      duplicates(
        PARTS[k].label,
        all(k).map(d => d.id),
      ),
    ),
    ...duplicates(
      "key",
      plugins.flatMap(p => (p.keys ?? []).map(k => k.id)),
    ),
  ]
  const dialogIds = new Set(dialogs.map(d => d.id))
  for (const i of all("items"))
    if (i.kind === "shape")
      for (const dialog of [i.dialogs?.add, i.dialogs?.edit])
        if (dialog !== undefined && !dialogIds.has(dialog)) problems.push(problem("E026", { id: i.id, dialog }))
  for (const t of all("pageTypes"))
    for (const dialog of [t.dialogs?.add, t.dialogs?.settings])
      if (dialog !== undefined && !dialogIds.has(dialog)) problems.push(problem("E031", { id: t.id, dialog }))
  const appearanceIds = new Set(all("libraryAppearances").map(d => d.id))
  for (const s of all("screens"))
    for (const appearance of s.libraryAppearances ?? [])
      if (!appearanceIds.has(appearance)) problems.push(problem("E075", { id: s.id, appearance }))
  // 範囲の宣言は型で書かせるが、動的に取り込む追加プラグインは型を通らないので値も確かめる
  for (const s of keyScopes)
    if (s.commandsFrom !== "stage" && s.commandsFrom !== "screen")
      problems.push(problem("E074", { id: s.id, value: String(s.commandsFrom) }))
  // プレゼンテーションの範囲はステージを描いている間だけ探すので、スクリーンから呼ぶコマンドの範囲は名乗れない
  const scopeCommands = keyScopeCommands(keyScopes)
  for (const pr of all("presentations"))
    if (pr.keyScope !== undefined && scopeCommands.get(pr.keyScope) === "screen")
      problems.push(problem("E072", { id: pr.id, scope: pr.keyScope }))
  if (problems.length > 0) throw matomezuError(problem("E016", { count: problems.length }), problems)
  const catalog = buildCoreCatalog({
    ...(Object.fromEntries(partsOf("core").map(k => [k, all(k)])) as unknown as Pick<CoreCatalogParts, CorePart>),
    messages: plugins.flatMap(p => (p.messages ? [p.messages] : [])),
    languages: plugins.flatMap(p => p.languages ?? []),
    tokens: plugins.flatMap(p => p.tokens ?? []),
    normalizeSteps: plugins.flatMap(p => p.normalizeSteps ?? []),
    followSteps: plugins.flatMap(p => (p.followSteps ?? []).map(step => ({ plugin: p.id, step }))),
  })
  // コマンドの名前も文言の表から引く。ビルトインプラグインの台帳アセンブルのときの確かめもかける（warning は store 台帳に残す）
  const checked = plugins.filter(isBuiltin).flatMap(p => (p.checks ?? []).flatMap(check => check(catalog)))
  const untitled = [
    ...commands
      .filter(c => !catalog.messages.has(c.title))
      .map(c => problem("E018", { kind: "command", id: c.id, title: c.title })),
    ...(plugins.flatMap(p => p.keys ?? []) as readonly { id: string; title?: string }[])
      .filter(k => k.title !== undefined && !catalog.messages.has(k.title))
      .map(k => problem("E018", { kind: "key", id: k.id, title: k.title ?? "" })),
    ...keyScopes
      .filter(s => !catalog.messages.has(s.title))
      .map(s => problem("E018", { kind: "keyScope", id: s.id, title: s.title })),
    ...checked.filter((c): c is Problem => !c.code.startsWith("W")),
  ]
  if (untitled.length > 0) throw matomezuError(problem("E016", { count: untitled.length }), untitled)
  const { keys, warnings: unscoped } = defaultKeys(plugins, new Map(commands.map(c => [c.id, c])), scopeCommands)
  if (controlCenter !== NO_CONTROL_CENTER && !catalog.controlCenters.has(controlCenter))
    fail("E110", { id: controlCenter })
  return {
    catalog: {
      core: catalog,
      store: {
        commands: new Map(commands.map(c => [c.id, c])),
        dialogs: new Map(dialogs.map(d => [d.id, d])),
        keyScopes: new Map(keyScopes.map(s => [s.id, s])),
        keys: new Map(keys.map(k => [k.id, k])),
        libraryAppearances: new Map(all("libraryAppearances").map(d => [d.id, d])),
        pluginStates: new Map(all("pluginStates").map(d => [d.id, d])),
        warnings: [
          ...performsWarnings(plugins, catalog),
          ...unscoped,
          ...keyWarnings(keys),
          ...checked.filter((c): c is Warning => c.code.startsWith("W")),
        ],
      },
    },
    controlCenter,
    autoSkin: autoSkin(catalog, auto),
  }
}

// キーの範囲の id → そこに置くキーバインドが呼ぶコマンド（土台の範囲とプラグインの範囲）
function keyScopeCommands(scopes: readonly KeyScopeDef[]): ReadonlyMap<string, KeyScopeCommandsFrom> {
  return new Map([
    ...Object.entries(BASE_KEY_SCOPES).map(([id, s]) => [id, s.commandsFrom] as const),
    ...scopes.map(s => [s.id, s.commandsFrom] as const),
  ])
}

// プラグインの既定のキーバインドを集める。読めないキー・無いコマンド・追加プラグインがほかのコマンドに結んだ行・ビルトインプラグインどうしで同じ範囲の同じキー・
// 自分の無い範囲か土台に無い名前（: の無い名前）に置いた行・スクリーンから呼ぶコマンドの範囲にステージで呼ぶコマンドを置いた行は error。
// よそのプラグインの範囲が無ければ（そのプラグインがいないか、その範囲を持たない）、その行だけ使わず warning（W031）
function defaultKeys(
  plugins: readonly Plugin[],
  commands: ReadonlyMap<string, Pick<CommandDef, "from">>,
  scopes: ReadonlyMap<string, KeyScopeCommandsFrom>,
): { keys: DefaultKey[]; warnings: Warning[] } {
  const keys: DefaultKey[] = []
  const warnings: Warning[] = []
  const problems = []
  for (const p of plugins) {
    const own = new Set((p.commands ?? []).map(c => c.id))
    for (const k of p.keys ?? []) {
      const key = normalizeKey(k.key)
      const command = commands.get(k.command)
      const from = scopes.get(k.scope)
      if (!key) problems.push(problem("E022", { key: k.key, command: k.command }))
      else if (!command) problems.push(problem("E024", { key: k.key, command: k.command }))
      else if (!isBuiltin(p) && !own.has(k.command))
        problems.push(problem("E302", { plugin: p.id, key: k.key, command: k.command }))
      else if (!from && (isOwnedBy(p.id, k.scope) || !k.scope.includes(":")))
        problems.push(problem("E071", { key: k.key, scope: k.scope, command: k.command }))
      else if (!from) warnings.push(warning("W031", p.id, { key: k.key, scope: k.scope, command: k.command }))
      else if (from === "screen" && command.from !== "screen")
        problems.push(problem("E073", { key: k.key, scope: k.scope, command: k.command }))
      else {
        const { id, title, ...binding } = k
        keys.push({
          id,
          ...(title ? { title } : {}),
          binding: { ...binding, key },
          plugin: p.id,
          builtin: isBuiltin(p),
        })
      }
    }
  }
  const seen = new Set<string>()
  for (const k of keys.filter(k => k.builtin)) {
    const at = `${k.binding.scope} ${k.binding.key}`
    if (seen.has(at)) problems.push(problem("E023", { key: k.binding.key, scope: k.binding.scope }))
    seen.add(at)
  }
  if (problems.length > 0) throw matomezuError(problem("E016", { count: problems.length }), problems)
  return { keys, warnings }
}

// コマンドの performs に書いた、表に無いアクション（W003。その行のコマンドは出ない）
function performsWarnings(plugins: readonly Plugin[], catalog: CoreCatalog): Warning[] {
  return plugins.flatMap(p =>
    (p.commands ?? []).flatMap(c =>
      (c.performs ?? [])
        .filter(a => !catalog.actions.has(a))
        .map(a => warning("W003", p.id, { command: c.id, action: a })),
    ),
  )
}

// 追加プラグインの既定のキーバインドで、同じ範囲・同じキーの先の行に負けて効かない行: ビルトインプラグインの行が先（W008）・
// id の順で先の追加プラグインの行が先（W021）。利用者の変更は入れずに見る（利用者の行に負けるのは warning にしない）
function keyWarnings(keys: readonly DefaultKey[]): Warning[] {
  const table = keyTable(keys, { added: [], removed: [] })
  return table.active.flatMap(entry => {
    const { binding, plugin, from } = entry
    const first = findKey(table, binding.scope, binding.key)
    if (from !== "plugin" || plugin === null || !first || first === entry) return []
    const params = { key: binding.key, scope: binding.scope, command: binding.command }
    return [
      first.from === "builtin"
        ? warning("W008", plugin, params)
        : warning("W021", plugin, { ...params, other: first.plugin ?? "" }),
    ]
  })
}

// 機能台帳の warning（core 台帳と store 台帳）
export const warningsOf = (catalog: Catalog): readonly Warning[] => [
  ...catalog.core.warnings,
  ...catalog.store.warnings,
]

function duplicates(kind: string, ids: readonly string[]) {
  const seen = new Set<string>()
  return ids.filter(id => seen.has(id) || !seen.add(id)).map(id => problem("E001", { kind, id }))
}
