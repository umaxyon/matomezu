// マークダウンのビューのペイン（見せ方のビューの中を分けた、1 つの見る所）: 原文を見せるソースのペインと、描いた文書を見せるペイン。
// 並べ方は、ステージごとの画面の状態（このプラグインの置き場）に持ち、画面の場所に入れる（読み直しても戻す。PANE_PLACED）。
// 並べ方は 4 つ（左右（split-row）・上下（split-column）に 2 つ並べるか、ソースだけ（source-only）・描いた文書だけ（rendered-only））。
// 並べたときの左（上下なら上）のペインが first、その幅（上下なら高さ）の割合が share。左右と上下で同じ first と share を使い、1 つだけ見せている間も覚えている。
// 利用者が並べ方を選んでいなければ（画面の場所にも無ければ）、ページを開いたときに 1 回、本文が空白だけでなければ描いた文書だけ、空なら
// ソースを左・描いた文書を右に半分ずつ並べる。開いたときに決めた並べ方は置き場に持ち（画面の場所には入れない）、本文を打っても変えない。
// 置き場は { chosen（利用者が選んだ並べ方）, opening（開いたときに決めた並べ方）} で、並べ方を読む所は paneLayoutOf（ビューとコマンドで同じ）
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

// 開いたときに決めた並べ方: どのページを開いたとき（page）に、どの並べ方（mode）に決めたか
export type PaneOpening = { page: string; mode: PaneMode }
export type PaneState = { chosen?: PaneLayout; opening?: PaneOpening }

// ステージの画面の状態 state（形に合わなければ何も無い）
function paneStateOf(state: unknown): PaneState {
  const s = typeof state === "object" && state !== null ? (state as Record<string, unknown>) : {}
  const chosen = PANE_LAYOUT.safeParse(s.chosen)
  const opening = z.object({ page: z.string(), mode: z.enum(PANE_MODES) }).safeParse(s.opening)
  return { ...(chosen.success ? { chosen: chosen.data } : {}), ...(opening.success ? { opening: opening.data } : {}) }
}

// 画面の場所に入れるのは、利用者が選んだ並べ方だけ（開いたときに決めた並べ方は入れず、戻すときも残す）
export const PANE_PLACED: PlacedStateDef<PaneLayout> = {
  schema: PANE_LAYOUT,
  take: state => paneStateOf(state).chosen,
  put: (placed, state) => {
    const { opening } = paneStateOf(state)
    return { ...(placed ? { chosen: placed } : {}), ...(opening ? { opening } : {}) }
  },
}

// 並べ方を決めるときに読む、ページの id と本文（本文を持たないページは空）
export const paneInputOf = (page: { id: string }): { id: string; text: string } => ({
  id: page.id,
  text: "text" in page && typeof page.text === "string" ? page.text : "",
})

// ページを開いたときに決める並べ方（本文が空白だけでなければ描いた文書だけ）
export const openingModeOf = (text: string): PaneMode => (text.trim() === "" ? DEFAULT.mode : "rendered-only")

// 今の並べ方: 利用者が選んだ並べ方、なければ（今のページを開いたときに決めた並べ方、それも無ければ本文から決める）既定
export function paneLayoutOf(state: unknown, page: { id: string; text: string } | null): PaneLayout {
  const { chosen, opening } = paneStateOf(state)
  if (chosen) return chosen
  const mode = page && opening?.page === page.id ? opening.mode : openingModeOf(page?.text ?? "")
  return { ...DEFAULT, mode }
}

// 利用者が並べ方を選んだ後の置き場
export const withChosen = (state: unknown, chosen: PaneLayout): PaneState => ({ ...paneStateOf(state), chosen })

// ページ page を開いたときに決めた並べ方を持った置き場（もう持っていれば undefined）
export function withOpening(state: unknown, page: { id: string; text: string }): PaneState | undefined {
  const now = paneStateOf(state)
  return now.opening?.page === page.id
    ? undefined
    : { ...now, opening: { page: page.id, mode: openingModeOf(page.text) } }
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
