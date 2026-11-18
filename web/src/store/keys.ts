// キーバインド: プラグインの既定と利用者の変更から、効いているキーバインドの表を作り、押したキーをコマンドに引く。
// 同じ範囲・同じキーのキーバインドは並べ（利用者 → ビルトインプラグイン → 追加プラグインの id の順）、効くのは先頭の 1 つだけ（先勝ち）。
// 範囲が違えば狭いほうが先（引く側が決める）

import type {
  BaseKeyScope,
  CommandId,
  CommandTable,
  KeyExtras,
  KeyScopeExtras,
  KeyScopeId,
  KeyScopeTable,
  MessageKey,
} from "../core/catalog"
import type { Inspected, Source, Step } from "../core/inspect"
import { type KeyBinding, type KeyChanges, normalizeKey, sameBinding } from "../core/keys"
import type { CommandArgs } from "./commands"

// キーの範囲が、そこに置くキーバインドに呼ばせるコマンド: ステージで呼ぶコマンド（stage）か、スクリーンから呼ぶコマンド（screen）か。
// ステージに属さない要素（ダイアログ・左サイドパネルなど、ステージを並べないスクリーンでも出る物）が名乗る範囲は screen。
// stage の範囲にはスクリーンから呼ぶコマンドも置ける（スクリーンから呼ぶコマンドはステージからも呼べる）
export type KeyScopeCommandsFrom = "stage" | "screen"

// 土台のキーの範囲: 題名と、そこに置くキーバインドが呼ぶコマンド
export const BASE_KEY_SCOPES = {
  global: { title: "Whole screen", commandsFrom: "stage" },
  stage: { title: "Stage", commandsFrom: "stage" },
  dialog: { title: "While a dialog is open", commandsFrom: "screen" },
  menu: { title: "While a menu is open", commandsFrom: "stage" },
  screen: { title: "Screens without stages", commandsFrom: "screen" },
} as const satisfies Readonly<Record<BaseKeyScope, { title: MessageKey; commandsFrom: KeyScopeCommandsFrom }>>

// 範囲 S に置くキーバインドが呼ぶコマンド（プラグインの範囲は KeyScopeTable の定義の型から）
type CommandsFromOf<S extends KeyScopeId> = S extends BaseKeyScope
  ? (typeof BASE_KEY_SCOPES)[S]["commandsFrom"]
  : S extends keyof KeyScopeTable
    ? KeyScopeTable[S] extends { commandsFrom: infer F }
      ? F
      : never
    : never

// コマンド C を置ける範囲: スクリーンから呼ぶコマンドはどの範囲にも、ステージで呼ぶコマンドは stage の範囲だけ
type ScopeFor<C extends CommandId> = CommandTable[C] extends { from: "screen" }
  ? KeyScopeId
  : { [S in KeyScopeId]: CommandsFromOf<S> extends "stage" ? S : never }[KeyScopeId]

// プラグインが書く既定のキーバインド 1 つ（kit.defineKey で書き、id と題名に頭が付く）。コマンドの引数の型が、args の型になる（引数の無いコマンドには書かない）。
// title は、設定画面で行を見分ける題名（無ければコマンドの題名）。args を書くキーバインドは、同じコマンドを args で分けるので title が要る。
// scope は、コマンドを置ける範囲（ScopeFor）だけ
export type KeyDef = {
  [C in CommandId]: {
    id: string
    key: string
    command: C
    scope: ScopeFor<C>
  } & (CommandArgs<C> extends [] ? { args?: undefined; title?: string } : { args: CommandArgs<C>[0]; title: string }) &
    KeyExtras
}[CommandId]

// プラグインのキーの範囲: id と、画面に出す題名（設定画面の見出しなど。kit.defineKeyScope で書き、id と題名に頭が付く）と、
// そこに置くキーバインドが呼ぶコマンド（KeyScopeCommandsFrom）
export interface KeyScopeDef extends KeyScopeExtras {
  id: string
  title: string
  commandsFrom: KeyScopeCommandsFrom
}

export const defineKeyScope = <const Id extends string, const F extends KeyScopeCommandsFrom>(
  def: KeyScopeDef & { id: Id; commandsFrom: F },
): KeyScopeDef & { id: Id; commandsFrom: F } => def

// 既定の 1 行と、それを書いたプラグイン（キーはそろえた書き方）
export interface DefaultKey {
  id: string // 既定のキーバインドの id（KeyDef の id）
  title?: string // 設定画面で見分ける題名（KeyDef の title）
  binding: KeyBinding
  plugin: string
  builtin: boolean
}

// 表の 1 行。from は誰の行か
export interface KeyEntry {
  binding: KeyBinding
  from: "user" | "builtin" | "plugin"
  plugin: string | null // 既定の行を書いたプラグイン（利用者の行は null）
}

// 使わなかった既定の行と、その理由（利用者が外した）
export interface DroppedKey {
  entry: KeyEntry
  reason: "removed"
}

export interface KeyTable {
  active: readonly KeyEntry[] // 先の順（利用者の行は後に足したものが先）。同じ範囲・同じキーなら、先頭の行だけが効く
  dropped: readonly DroppedKey[]
}

// 既定と利用者の変更から、表を作る。利用者の行で読めないキーのものは使わない
export function keyTable(defaults: readonly DefaultKey[], changes: KeyChanges): KeyTable {
  const user: KeyEntry[] = changes.added
    .flatMap(b => {
      const key = normalizeKey(b.key)
      return key ? [{ binding: { ...b, key }, from: "user" as const, plugin: null }] : []
    })
    .reverse()
  const builtin: KeyEntry[] = []
  const plugin: KeyEntry[] = []
  const dropped: DroppedKey[] = []
  for (const d of defaults) {
    const entry: KeyEntry = { binding: d.binding, from: d.builtin ? "builtin" : "plugin", plugin: d.plugin }
    if (changes.removed.some(r => sameBinding(r, d.binding))) dropped.push({ entry, reason: "removed" })
    else (d.builtin ? builtin : plugin).push(entry)
  }
  // 追加プラグインは id の順（読み込んだ順は環境で変わるため）。同じプラグインの中は書いた順
  const byPlugin = plugin
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.plugin ?? "").localeCompare(b.e.plugin ?? "") || a.i - b.i)
    .map(x => x.e)
  return { active: [...user, ...builtin, ...byPlugin], dropped }
}

// その範囲で、そのキー（そろえた書き方）の先頭の行（効く行）
export function findKey(table: KeyTable, scope: string, key: string): KeyEntry | undefined {
  return table.active.find(e => e.binding.scope === scope && e.binding.key === key)
}

// そのコマンドに効いている行（ほかの行に負けていないもの。並びは勝つ順）。メニューにキーを添えるのに使う
export function keysOf(table: KeyTable, command: string): KeyEntry[] {
  return table.active.filter(e => e.binding.command === command && findKey(table, e.binding.scope, e.binding.key) === e)
}

// キーを引く範囲の広さ: 名乗った範囲から外へ土台の範囲まで（outward）か、名乗った範囲だけ（named。テキストFormの中で押したキーを、そのテキストFormが名乗った範囲だけで引く）
export type KeyReach = "outward" | "named"

// 押したキーを引く範囲の並び（狭いものから）。右クリックのメニューとダイアログは開いている間ほかを止める。カレントスクリーンがステージを並べないスクリーンの間は、土台の範囲として screen だけを引く。
// scopes はプラグインの範囲（押した所の要素が名乗ったもの。狭いものから）、shown はカレントのステージのプレゼンテーションが名乗った範囲（ステージの範囲の前に探す）
export function keyScopes(
  open: { menu: boolean; dialog: boolean; center?: boolean },
  scopes: readonly string[] = [],
  shown?: string,
  reach: KeyReach = "outward",
): string[] {
  if (reach === "named") return [...scopes]
  if (open.menu) return [...scopes, "menu"]
  if (open.dialog) return [...scopes, "dialog"]
  // カレントスクリーンがステージを並べないスクリーンの間は、ステージの範囲（stage・global・プレゼンテーションの範囲）を引かない
  if (open.center) return [...scopes, "screen"]
  return [...scopes, ...(shown && !scopes.includes(shown) ? [shown] : []), "stage", "global"]
}

const sourceOf = (e: KeyEntry, dropped?: DroppedKey["reason"]): Source => ({
  source: "key",
  from: e.from,
  plugin: e.plugin,
  binding: e.binding,
  ...(dropped ? { dropped } : {}),
})

// 問い合わせ: その範囲のそのキーが、どのコマンドに決まったか。ステップは勝つ順の行と、使わなかった既定の行（値は null）
export function inspectKey(table: KeyTable, q: { scope: string; key: string }): Inspected<string> {
  const key = normalizeKey(q.key)
  const hits = (e: KeyEntry) => e.binding.scope === q.scope && e.binding.key === key
  const steps: Step<string>[] = [
    ...table.active.filter(hits).map(e => ({ from: sourceOf(e), value: e.binding.command })),
    ...table.dropped.filter(d => hits(d.entry)).map(d => ({ from: sourceOf(d.entry, d.reason), value: null })),
  ]
  const hit = steps[0]?.value != null ? steps[0] : undefined
  return { value: hit?.value ?? null, decidedBy: hit?.from ?? null, steps }
}

// 狭い範囲の同じキーに隠れる行（画面全体の行が、ステージでは隠れるなど）
export function shadowedKeys(table: KeyTable): { entry: KeyEntry; by: KeyEntry }[] {
  return table.active.flatMap(e => {
    if (e.binding.scope !== "global" || findKey(table, "global", e.binding.key) !== e) return []
    const by = findKey(table, "stage", e.binding.key)
    return by ? [{ entry: e, by }] : []
  })
}
