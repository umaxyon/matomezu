// プラグイン状態（定義は core/def/plugin-state.ts）の値の置き場と、画面の場所との行き来。
// 値は pluginValues に持つ（窓の外観枠は id → 値、ステージは ステージの id → id → 値）。画面の場所に入れる宣言（address が none でない）の値は、置くときも場所から戻すときも
// 宣言の形（schema）で読み、合わない値と宣言の無い id は無いものとして落とす。入れない宣言（none）は場所に出さず、場所から来ても読まず、戻る・進むでも残す

import type { PluginStateDef, PluginStateScope } from "../core/def/plugin-state"
import { fail } from "../core/errors"
import { isOwnedBy } from "../core/names"

export interface PluginValues {
  readonly window: Readonly<Record<string, unknown>>
  readonly stages: Readonly<Record<string, Readonly<Record<string, unknown>>>>
}

export const NO_PLUGIN_STATES: PluginValues = { window: {}, stages: {} }

// 宣言の表（id → 定義）
export type PluginStateDefs = ReadonlyMap<string, PluginStateDef>

// 値の組 values のうち、scope の宣言の、画面の場所に入れる物だけの組（画面の場所へ出す形）
export function placedOf(
  defs: PluginStateDefs,
  scope: PluginStateScope,
  values: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [id, value] of Object.entries(values ?? {})) {
    const def = defs.get(id)
    if (def?.scope === scope && def.address !== "none" && value !== undefined) out[id] = value
  }
  return out
}

// 場所の値の組 raw のうち、scope の宣言があり、画面の場所に入れる宣言で、形に合う値だけの組（宣言の無い id・入れない宣言の id・合わない値は落とす）
export function readPlaced(
  defs: PluginStateDefs,
  scope: PluginStateScope,
  raw: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  const read: Record<string, unknown> = {}
  for (const [id, value] of Object.entries(raw ?? {})) {
    const def = defs.get(id)
    if (def?.scope !== scope || def.address === "none" || !def.schema) continue
    const parsed = def.schema.safeParse(value)
    if (parsed.success && parsed.data !== undefined) read[id] = parsed.data
  }
  return read
}

// 現在の値の組 now のうち、scope の宣言の、画面の場所に入れない物だけの組（場所を当てはめても残す）
export function keptOutside(
  defs: PluginStateDefs,
  scope: PluginStateScope,
  now: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  const kept: Record<string, unknown> = {}
  for (const [id, value] of Object.entries(now ?? {})) {
    const def = defs.get(id)
    if (def?.scope === scope && def.address === "none") kept[id] = value
  }
  return kept
}

// 値の組 values の id を value にした新しい組（undefined なら消す）
export function withPluginState(
  values: Readonly<Record<string, unknown>> | undefined,
  id: string,
  value: unknown,
): Record<string, unknown> {
  const { [id]: _, ...rest } = values ?? {}
  return value === undefined ? rest : { ...rest, [id]: value }
}

// 宣言 def が持ち主 owner（プラグインの id）の物か確かめて、そのまま返す（ほかのプラグインの宣言は E125）
export function ownedPluginState<S>(owner: string, def: PluginStateDef<S>): PluginStateDef<S> {
  return isOwnedBy(owner, def.id) ? def : fail("E125", { id: def.id, owner })
}

// 宣言 def の今の値（ステージの宣言は stage のステージの値。無ければ undefined）
export function pluginValueOf<S>(values: PluginValues, stage: string, def: PluginStateDef<S>): S | undefined {
  return (def.scope === "window" ? values.window[def.id] : values.stages[stage]?.[def.id]) as S | undefined
}

// 画面の場所に入れて、変わるたびにブラウザの履歴に積むと宣言した id の組
export const pushingIds = (defs: PluginStateDefs): ReadonlySet<string> =>
  new Set([...defs.values()].filter(d => d.address === "push").map(d => d.id))
