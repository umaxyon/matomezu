// 場所に入れる画面の状態（定義は core/def/placed-state.ts）を、ステージの置き場と画面の場所の間で行き来させる。
// 場所に入れるのは take が返す部分で、場所から戻すときは schema で読み、合わない値は無いものとして put に渡す
import type { PlacedStateDef } from "../core/def/placed-state"

// ステージ 1 つの置き場（プラグインの id → 画面の状態）から、場所に入れる物（プラグインの id → 値）
export function takePlaced(
  defs: ReadonlyMap<string, PlacedStateDef>,
  states: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  const placed: Record<string, unknown> = {}
  for (const [owner, def] of defs) {
    const state = states?.[owner]
    const value = state === undefined ? undefined : def.take ? def.take(state) : state
    if (value !== undefined) placed[owner] = value
  }
  return placed
}

// ステージ 1 つの置き場 states に、場所の値 placed を戻した新しい置き場（場所に入れないプラグインの置き場はそのまま）
export function putPlaced(
  defs: ReadonlyMap<string, PlacedStateDef>,
  states: Readonly<Record<string, unknown>> | undefined,
  placed: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...states }
  for (const [owner, def] of defs) {
    const read = def.schema.safeParse(placed[owner])
    const value = read.success ? read.data : undefined
    const put = def.put ? def.put(value, next[owner]) : value
    if (put === undefined) delete next[owner]
    else next[owner] = put
  }
  return next
}
