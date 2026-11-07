// マークダウンのビューのペイン（見せ方のビューの中を分けた、1 つの見る所）: 原文を見せるソースのペインと、描いた文書を見せるペイン。
// 並べ方は、ステージごとの画面の状態（このプラグインの置き場）に持ち、画面の場所に入れる（読み直しても戻す。PANE_PLACED）。
// 並べ方は 4 つ（左右（split-row）・上下（split-column）に 2 つ並べるか、ソースだけ（source-only）・描いた文書だけ（rendered-only））。
// 並べたときの左（上下なら上）のペインが first、その幅（上下なら高さ）の割合が share。左右と上下で同じ first と share を使い、1 つだけ見せている間も覚えている。
// 置き場に何も無いか形に合わなければ、ソースを左・描いた文書を右に半分ずつ並べる
import { z } from "zod"
import type { PlacedStateDef } from "../../../plugin-api"

export const PANES = ["source", "rendered"] as const
export type Pane = (typeof PANES)[number]

export const PANE_MODES = ["split-row", "split-column", "source-only", "rendered-only"] as const
export type PaneMode = (typeof PANE_MODES)[number]

export const EVEN_PANE_SHARE = 0.5
export const MIN_PANE_SHARE = 0.15 // 片方のペインの割合の下限（ステージの境目と同じ）

const PANE_LAYOUT = z.object({
  mode: z.enum(PANE_MODES),
  first: z.enum(PANES),
  share: z
    .number()
    .min(MIN_PANE_SHARE)
    .max(1 - MIN_PANE_SHARE),
})
export type PaneLayout = z.infer<typeof PANE_LAYOUT>

const DEFAULT: PaneLayout = { mode: "split-row", first: "source", share: EVEN_PANE_SHARE }

// 画面の場所に入れる、このプラグインの画面の状態（置き場をそのまま入れる）
export const PANE_PLACED: PlacedStateDef<PaneLayout> = { schema: PANE_LAYOUT }

// ステージの画面の状態 state の並べ方（形に合わなければ既定）
export function paneLayoutOf(state: unknown): PaneLayout {
  const read = PANE_LAYOUT.safeParse(state)
  return read.success ? read.data : DEFAULT
}

// 並べる向き（1 つだけ見せている間は "none"）
export function splitOf(mode: PaneMode): "row" | "column" | "none" {
  return mode === "split-row" ? "row" : mode === "split-column" ? "column" : "none"
}

// 見せるペイン（並べていれば、左（上）から順）
export function shownPanes(layout: PaneLayout): readonly Pane[] {
  if (layout.mode === "source-only") return ["source"]
  if (layout.mode === "rendered-only") return ["rendered"]
  return layout.first === "source" ? ["source", "rendered"] : ["rendered", "source"]
}

// 2 つのペインを入れ替えた並べ方
export const swapPanes = (layout: PaneLayout): PaneLayout => ({
  ...layout,
  first: layout.first === "source" ? "rendered" : "source",
})

// 境目を、並べた長さ length の始め（左か上）から at の所に動かした割合（下限から 1 - 下限に収め、URL に書く桁にそろえる）
export function shareAt(at: number, length: number, now: number): number {
  if (length <= 0) return now
  const share = Math.min(1 - MIN_PANE_SHARE, Math.max(MIN_PANE_SHARE, at / length))
  return Math.round(share * 1000) / 1000
}
