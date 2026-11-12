// 場所に入れる画面の状態（定義は core/def/placed-state.ts）の値の置き場と、画面の場所との行き来。
// 値は placedValues に持つ（窓の外は id → 値、ステージは ステージの id → id → 値）。置くときも場所から戻すときも、宣言した形（schema）で読み、
// 合わない値と宣言の無い id は無いものとして落とす。場所に入れるのは宣言した値そのもの（core は中を読まない）
import type { PlacedScope, PlacedStateDef } from "../core/def/placed-state"
import { fail } from "../core/errors"
import { isOwnedBy } from "../core/names"

export interface PlacedValues {
  readonly frame: Readonly<Record<string, unknown>>
  readonly stages: Readonly<Record<string, Readonly<Record<string, unknown>>>>
}

export const NO_PLACED: PlacedValues = { frame: {}, stages: {} }

// 宣言の表（id → 定義）
export type PlacedDefs = ReadonlyMap<string, PlacedStateDef>

// 場所の値の組 raw のうち、scope の宣言があり、形に合う値だけの組（宣言の無い id・合わない値は落とす。undefined の値は持たない）
export function readPlaced(
  defs: PlacedDefs,
  scope: PlacedScope,
  raw: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  const read: Record<string, unknown> = {}
  for (const [id, value] of Object.entries(raw ?? {})) {
    const def = defs.get(id)
    if (def?.scope !== scope) continue
    const parsed = def.schema.safeParse(value)
    if (parsed.success && parsed.data !== undefined) read[id] = parsed.data
  }
  return read
}

// 値の組 values の id を value にした新しい組（undefined なら消す）
export function withPlaced(
  values: Readonly<Record<string, unknown>> | undefined,
  id: string,
  value: unknown,
): Record<string, unknown> {
  const { [id]: _, ...rest } = values ?? {}
  return value === undefined ? rest : { ...rest, [id]: value }
}

// ブラウザの履歴に積むと宣言した id の組
export const pushingIds = (defs: PlacedDefs): ReadonlySet<string> =>
  new Set([...defs.values()].filter(d => d.browserHistory === "push").map(d => d.id))

// 宣言 def が持ち主 owner（プラグインの id）の物か確かめて、そのまま返す（ほかのプラグインの宣言は E121）
export function ownedPlaced<S>(owner: string, def: PlacedStateDef<S>): PlacedStateDef<S> {
  return isOwnedBy(owner, def.id) ? def : fail("E121", { id: def.id, owner })
}

// 宣言 def の今の値（ステージの宣言は stage のステージの値。無ければ undefined）
export function placedValueOf<S>(values: PlacedValues, stage: string, def: PlacedStateDef<S>): S | undefined {
  return (def.scope === "frame" ? values.frame[def.id] : values.stages[stage]?.[def.id]) as S | undefined
}
