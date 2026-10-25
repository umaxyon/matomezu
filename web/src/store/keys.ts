// キーの割り当て: プラグインの既定と利用者の変更から、効いている割り当ての表を作り、押したキーをコマンドに引く。
// 勝つ順は 利用者 > ビルトインプラグイン > 追加プラグイン。ぶつかるのは同じ範囲・同じキーのときだけで、範囲が違えば狭いほうが勝つ（引く側が決める）。
// 追加プラグインの既定は、ビルトインプラグインの既定とぶつかれば使わず、追加プラグインどうしでぶつかれば、どちらも使わない（利用者が自分で割り当てる）
import type { Inspected, Source, Step } from "../core/inspect"
import { type KeyBinding, type KeyChanges, normalizeKey, sameBinding } from "../core/keys"
import type { CommandId, KeyScopeId } from "../core/tables"
import type { CommandArgs } from "./commands"

// プラグインが書く既定の割り当て。コマンドの引数の型が、args の型になる（引数の無いコマンドには書かない）
export type KeyDef = {
  [C in CommandId]: { key: string; command: C; scope: KeyScopeId } & (CommandArgs<C> extends []
    ? { args?: undefined }
    : { args: CommandArgs<C>[0] })
}[CommandId]

export const defineKeys = <const K extends readonly KeyDef[]>(keys: K): K => keys

// 既定の 1 行と、それを書いたプラグイン（キーはそろえた書き方）
export interface DefaultKey {
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

// 使わなかった既定の行と、その理由（利用者が外した・ビルトインプラグインとぶつかった・追加プラグインどうしでぶつかった）
export interface DroppedKey {
  entry: KeyEntry
  reason: "removed" | "builtin" | "plugins"
}

export interface KeyTable {
  active: readonly KeyEntry[] // 勝つ順（利用者の行は後に足したものが先）
  dropped: readonly DroppedKey[]
}

const at = (b: KeyBinding) => `${b.scope}\u0000${b.key}`

// 既定と利用者の変更から、表を作る。利用者の行で読めないキーのものは使わない
export function keyTable(defaults: readonly DefaultKey[], changes: KeyChanges): KeyTable {
  const user: KeyEntry[] = changes.added
    .flatMap(b => {
      const key = normalizeKey(b.key)
      return key ? [{ binding: { ...b, key }, from: "user" as const, plugin: null }] : []
    })
    .reverse()
  const builtinAt = new Set(defaults.filter(d => d.builtin).map(d => at(d.binding)))
  const pluginsAt = new Map<string, Set<string>>()
  for (const d of defaults.filter(d => !d.builtin))
    pluginsAt.set(at(d.binding), (pluginsAt.get(at(d.binding)) ?? new Set()).add(d.plugin))
  const builtin: KeyEntry[] = []
  const plugin: KeyEntry[] = []
  const dropped: DroppedKey[] = []
  for (const d of defaults) {
    const entry: KeyEntry = { binding: d.binding, from: d.builtin ? "builtin" : "plugin", plugin: d.plugin }
    if (changes.removed.some(r => sameBinding(r, d.binding))) dropped.push({ entry, reason: "removed" })
    else if (d.builtin) builtin.push(entry)
    else if (builtinAt.has(at(d.binding))) dropped.push({ entry, reason: "builtin" })
    else if ((pluginsAt.get(at(d.binding))?.size ?? 0) > 1) dropped.push({ entry, reason: "plugins" })
    else plugin.push(entry)
  }
  return { active: [...user, ...builtin, ...plugin], dropped }
}

// その範囲で、そのキー（そろえた書き方）に勝つ行
export function findKey(table: KeyTable, scope: string, key: string): KeyEntry | undefined {
  return table.active.find(e => e.binding.scope === scope && e.binding.key === key)
}

// そのコマンドに効いている行（ほかの行に負けていないもの。並びは勝つ順）。メニューにキーを添えるのに使う
export function keysOf(table: KeyTable, command: string): KeyEntry[] {
  return table.active.filter(e => e.binding.command === command && findKey(table, e.binding.scope, e.binding.key) === e)
}

// 押したキーを引く範囲の並び（狭いものから）。右クリックのメニューとダイアログは開いている間ほかを止める。
// scopes はプラグインの範囲（押した所の要素が名乗ったもの。狭いものから）
export function keyScopes(open: { menu: boolean; dialog: boolean }, scopes: readonly string[] = []): string[] {
  if (open.menu) return [...scopes, "menu"]
  if (open.dialog) return [...scopes, "dialog"]
  return [...scopes, "stage", "global"]
}

const sourceOf = (e: KeyEntry, dropped?: DroppedKey["reason"]): Source => ({
  source: "key",
  from: e.from,
  plugin: e.plugin,
  binding: e.binding,
  ...(dropped ? { dropped } : {}),
})

// 問い合わせ: その範囲のそのキーが、どのコマンドに決まったか。段は勝つ順の行と、使わなかった既定の行（値は null）
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
