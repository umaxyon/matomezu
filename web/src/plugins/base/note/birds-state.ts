// 伝言の付ける先の鳥の割り当て（付ける先 → 鳥）の、base のステージの画面の状態での持ち方: noteBirds に持つ。
// 右サイドパネルが伝言を出している間だけ持ち、付ける先が無くなれば消す。ブックのデータにも URL にも入れない
import type { Bird } from "../birds"

// base のステージの画面の状態 state の、鳥の割り当て（無ければ空）
export const birdsIn = (state: unknown): Readonly<Record<string, Bird>> =>
  (state as { noteBirds?: Record<string, Bird> } | undefined)?.noteBirds ?? {}

// base のステージの画面の状態 state の、鳥の割り当てを birds にしたもの（空なら消す）
export function withBirds(state: unknown, birds: Readonly<Record<string, Bird>>): Record<string, unknown> {
  const { noteBirds: _, ...rest } = (state as Record<string, unknown> | undefined) ?? {}
  return Object.keys(birds).length > 0 ? { ...rest, noteBirds: birds } : rest
}
