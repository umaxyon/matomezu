// 節の大きさの選び方: 伸びる（キャプション 1 行の幅）・折り返す（N 字の幅で折り返す）・最大で固定（N 字の幅まで。超えた分は … で切る）。
// N は 10・20・30 字。ブックとページの設定の項目で持ち（ページはブックを継承できる）、節ごとにも選べる（節の size。無ければページに従う）
import { z } from "zod"
import { kit } from "./kit"

export const NODE_SIZES = ["grow", "wrap-10", "wrap-20", "wrap-30", "fixed-10", "fixed-20", "fixed-30"] as const
export type NodeSize = (typeof NODE_SIZES)[number]

// 何も選んでいないときの選び方
export const DEFAULT_NODE_SIZE: NodeSize = "fixed-20"

export const NODE_SIZE = kit.defineSetting({
  id: "node-size",
  title: "Node size",
  schema: z.enum(NODE_SIZES),
  default: DEFAULT_NODE_SIZE,
})

// 大きさの選び方と、幅の字の数（伸びるは null）
export function sizeRule(size: NodeSize): { mode: "grow" | "wrap" | "fixed"; chars: number | null } {
  if (size === "grow") return { mode: "grow", chars: null }
  const [mode, chars] = size.split("-")
  return { mode: mode === "wrap" ? "wrap" : "fixed", chars: Number(chars) }
}
