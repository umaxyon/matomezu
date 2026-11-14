// マークダウンのビューのペイン（見せ方のビューの中を分けた、1 つの見る所）: 原文を見せるソースのペインと、描いた文書を見せるペイン。
// 利用者が選んだ並べ方は、画面の場所に入れるプラグイン状態の宣言（PANE_LAYOUT_STATE）の値で、画面の場所に入れる（読み直しても戻す）。
// 並べ方は 4 つ（左右（split-row）・上下（split-column）に 2 つ並べるか、ソースだけ（source-only）・描いた文書だけ（rendered-only））。
// 並べたときの左（上下なら上）のペインが first、その幅（上下なら高さ）の割合が share。左右と上下で同じ first と share を使い、1 つだけ見せている間も覚えている。
// 利用者が入れ替えていなければ first は無く、並べる向きの既定（左右はソースが左、上下はプレビューが上。defaultFirstOf）になる。入れ替えたら first を書き、向きを変えても使う。
// 利用者が並べ方を選んでいなければ（画面の場所にも無ければ）、ページを開いたときに 1 回、本文が空白だけでなければ描いた文書だけ、空なら
// ソースを左・描いた文書を右に半分ずつ並べる。開いたときに決めた並べ方は PANE_OPENING_STATE に持ち（画面の場所には入れない）、本文を打っても変えない。
// 並べ方を読む所は paneLayoutOf（ビューとコマンドで同じ）
import { z } from "zod"
import { MARKDOWN_PANE_MODES, type MarkdownPaneMode } from "../../base"
import { kit } from "./kit"
import { SCROLL_STATE } from "./scroll-memory"

export const PANES = ["source", "rendered"] as const
export type Pane = (typeof PANES)[number]

export const PANE_MODES = MARKDOWN_PANE_MODES // 値の並びと型は base が出す
export type PaneMode = MarkdownPaneMode

export const EVEN_PANE_SHARE = 0.5
export const MIN_PANE_SHARE = 0.15 // 片方のペインの割合の下限（ステージの境目と同じ）

const PANE_LAYOUT = z.object({
  mode: z.enum(PANE_MODES),
  first: z.enum(PANES).optional(), // 入れ替えていなければ無い
  share: z
    .number()
    .min(MIN_PANE_SHARE)
    .max(1 - MIN_PANE_SHARE),
})
// 利用者が選んだ並べ方（first は入れ替えたときだけ）
export type ChosenLayout = z.infer<typeof PANE_LAYOUT>
// 今の並べ方（first は決まっている）
export type PaneLayout = Required<ChosenLayout>

// 入れ替えていないときの、左（上）のペイン: 左右はソース、上下はプレビュー
export const defaultFirstOf = (mode: PaneMode): Pane => (mode === "split-column" ? "rendered" : "source")

const DEFAULT = { mode: "split-row", share: EVEN_PANE_SHARE } as const

// 開いたときに決めた並べ方: どのページを開いたとき（page）に、どの並べ方（mode）に決めたか
export type PaneOpening = { page: string; mode: PaneMode }

// 開いたときに決めた並べ方（画面の場所には入れない。ステージごとのプラグイン状態）
export const PANE_OPENING_STATE = kit.definePluginStateOf<PaneOpening>()({ id: "pane-opening", scope: "stage" })

// 画面の場所に入れるのは、利用者が選んだ並べ方だけ。ステージごとの値で、変えても今の履歴を書き換える
export const PANE_LAYOUT_STATE = kit.definePluginState({
  id: "pane-layout",
  scope: "stage",
  schema: PANE_LAYOUT,
  address: "replace",
})

// 並べ方を決めるときに読む、ページの id と本文（本文を持たないページは空）
export const paneInputOf = (page: { id: string }): { id: string; text: string } => ({
  id: page.id,
  text: "text" in page && typeof page.text === "string" ? page.text : "",
})

// ページを開いたときに決める並べ方（本文が空白だけでなければ描いた文書だけ）
export const openingModeOf = (text: string): PaneMode => (text.trim() === "" ? DEFAULT.mode : "rendered-only")

// 今の並べ方: 利用者が選んだ並べ方 chosen、なければ（今のページを開いたときに決めた並べ方 opening、それも無ければ本文から決める）既定
export function paneLayoutOf(
  chosen: ChosenLayout | undefined,
  opening: PaneOpening | undefined,
  page: { id: string; text: string } | null,
): PaneLayout {
  if (chosen) return { ...chosen, first: chosen.first ?? defaultFirstOf(chosen.mode) }
  const mode = page && opening?.page === page.id ? opening.mode : openingModeOf(page?.text ?? "")
  return { ...DEFAULT, mode, first: defaultFirstOf(mode) }
}

// 今の並べ方 layout のうち patch を書き換えた、選んだ並べ方（入れ替えていなければ first は書かない）
export const chosenWith = (
  chosen: ChosenLayout | undefined,
  layout: PaneLayout,
  patch: Partial<ChosenLayout>,
): ChosenLayout => ({ ...(chosen ?? { mode: layout.mode, share: layout.share }), ...patch })

// ページ page を開いたときに決めた並べ方（もう決めていれば undefined）
export function openingFor(
  opening: PaneOpening | undefined,
  page: { id: string; text: string },
): PaneOpening | undefined {
  return opening?.page === page.id ? undefined : { page: page.id, mode: openingModeOf(page.text) }
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

export const MARKDOWN_STATES = [PANE_LAYOUT_STATE, PANE_OPENING_STATE, SCROLL_STATE] as const
