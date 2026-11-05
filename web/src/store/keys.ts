// キーバインド: プラグインの既定と利用者の変更から、効いているキーバインドの表を作り、押したキーをコマンドに引く。
// 同じ範囲・同じキーのキーバインドは並べ（利用者 → ビルトインプラグイン → 追加プラグインの id の順）、効くのは先頭の 1 つだけ（先勝ち）。
// 範囲が違えば狭いほうが先（引く側が決める）

import type { BaseKeyScope, CommandId, KeyExtras, KeyScopeExtras, KeyScopeId, MessageKey } from "../core/catalog"
import type { Inspected, Source, Step } from "../core/inspect"
import { type KeyBinding, type KeyChanges, normalizeKey, sameBinding } from "../core/keys"
import { sameData } from "../core/same"
import type { CommandArgs } from "./commands"

// プラグインが書く既定のキーバインド 1 つ（kit.defineKey で書き、id と題名に頭が付く）。コマンドの引数の型が、args の型になる（引数の無いコマンドには書かない）。
// title は、設定画面で行を見分ける題名（無ければコマンドの題名）。args を書くキーバインドは、同じコマンドを args で分けるので title が要る
export type KeyDef = {
  [C in CommandId]: {
    id: string
    key: string
    command: C
    scope: KeyScopeId
  } & (CommandArgs<C> extends [] ? { args?: undefined; title?: string } : { args: CommandArgs<C>[0]; title: string }) &
    KeyExtras
}[CommandId]

// プラグインのキーの範囲: id と、画面に出す題名（設定画面の見出しなど。kit.defineKeyScope で書き、id と題名に頭が付く）
export interface KeyScopeDef extends KeyScopeExtras {
  id: string
  title: string
}

export const defineKeyScope = <const Id extends string>(def: KeyScopeDef & { id: Id }): KeyScopeDef & { id: Id } => def

// 土台のキーの範囲の題名
export const BASE_KEY_SCOPE_TITLES: Readonly<Record<BaseKeyScope, MessageKey>> = {
  global: "Whole screen",
  stage: "Stage",
  dialog: "While a dialog is open",
  menu: "While a menu is open",
}

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

// 押したキーを引く範囲の並び（狭いものから）。右クリックのメニューとダイアログは開いている間ほかを止める。
// scopes はプラグインの範囲（押した所の要素が名乗ったもの。狭いものから）、shown はカレントのステージの見せ方が名乗った範囲（ステージの範囲の前に探す）
export function keyScopes(
  open: { menu: boolean; dialog: boolean },
  scopes: readonly string[] = [],
  shown?: string,
  reach: KeyReach = "outward",
): string[] {
  if (reach === "named") return [...scopes]
  if (open.menu) return [...scopes, "menu"]
  if (open.dialog) return [...scopes, "dialog"]
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

// 設定画面の 1 行: 範囲 scope で、コマンド command を args の値で呼ぶキーバインドの並び（args で分かれるキーバインドは別の行）
export interface KeyRow {
  scope: string
  command: string
  args?: unknown
  title?: string // 既定のキーバインドの題名（無ければコマンドの題名で出す）
  keys: readonly { entry: KeyEntry; first: KeyEntry }[] // 表の順。first は同じ範囲・同じキーで効いている行（entry と違えば、entry は効いていない）
  changed: boolean // 利用者が足したか外したキーバインドがある
}

type RowKey = Pick<KeyBinding, "scope" | "command" | "args">
const inRow = (b: KeyBinding, row: RowKey) =>
  b.scope === row.scope && b.command === row.command && sameData(b.args, row.args)

// 既定と利用者の変更から、設定画面の行を作る（並びは既定の順、利用者だけが足した行はその後）
export function keyRows(defaults: readonly DefaultKey[], changes: KeyChanges): KeyRow[] {
  const table = keyTable(defaults, changes)
  const rows: { key: RowKey; title?: string }[] = []
  const add = (b: KeyBinding, title?: string) => {
    if (!rows.some(r => inRow(b, r.key)))
      rows.push({
        key: { scope: b.scope, command: b.command, ...(b.args === undefined ? {} : { args: b.args }) },
        title,
      })
  }
  for (const d of defaults) add(d.binding, d.title)
  for (const b of changes.added) add(b)
  return rows.map(({ key, title }) => ({
    ...key,
    ...(title ? { title } : {}),
    keys: table.active
      .filter(e => inRow(e.binding, key))
      .map(entry => ({ entry, first: findKey(table, entry.binding.scope, entry.binding.key) ?? entry })),
    changed: [...changes.added, ...changes.removed].some(b => inRow(b, key)),
  }))
}

// 利用者の変更に、キーバインド b を足した変更（外した既定なら外したのを取り消し、無ければ足した行に加える。読めないキーは足さない）
export function withKeyAdded(changes: KeyChanges, b: KeyBinding): KeyChanges {
  const key = normalizeKey(b.key)
  if (!key) return changes
  const binding = { ...b, key }
  if (changes.removed.some(r => sameBinding(r, binding)))
    return { ...changes, removed: changes.removed.filter(r => !sameBinding(r, binding)) }
  if (changes.added.some(a => sameBinding(a, binding))) return changes
  return { ...changes, added: [...changes.added, binding] }
}

// 利用者の変更から、キーバインド b を外した変更（利用者が足した行なら取り除き、既定なら外した行に加える）
export function withKeyRemoved(changes: KeyChanges, b: KeyBinding): KeyChanges {
  if (changes.added.some(a => sameBinding(a, b)))
    return { ...changes, added: changes.added.filter(a => !sameBinding(a, b)) }
  if (changes.removed.some(r => sameBinding(r, b))) return changes
  return { ...changes, removed: [...changes.removed, b] }
}

// 行 row を既定に戻した変更（その行の、足した行と外した行を取り除く）
export function withRowReset(changes: KeyChanges, row: RowKey): KeyChanges {
  return { added: changes.added.filter(b => !inRow(b, row)), removed: changes.removed.filter(b => !inRow(b, row)) }
}
