// キーバインドの設定画面の行: 既定のキーバインドと利用者の変更から、範囲・コマンド・args ごとの行を作り、行のキーを足す・外す・既定に戻した利用者の変更を作る
import { type KeyBinding, type KeyChanges, normalizeKey, sameBinding } from "../../../core/keys"
import { sameData } from "../../../core/same"
import { type DefaultKey, findKey, type KeyEntry, keyTable } from "../../../store/keys"

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
