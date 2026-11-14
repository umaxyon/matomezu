// マークダウンのビューのスクロール位置の記憶: ページごとに、ソースのペインと描いた文書のペインの位置（px）を別々に覚え、次にそのページを開いたとき戻す。
// 覚えていないページは先頭から。ステージごとのプラグイン状態で、画面の場所に入れる（読み直しても戻る）。URL が長くならないよう、覚えるのは新しく触った MAX_REMEMBERED ページまで
import { z } from "zod"
import { kit } from "./kit"
import type { Pane } from "./panes"

export const MAX_REMEMBERED = 30

const POSITION = z.number().int().min(0)
const PAGE_SCROLL = z.object({ source: POSITION.optional(), rendered: POSITION.optional() })
export type PageScroll = z.infer<typeof PAGE_SCROLL>

// ページの id → 位置。後ろほど新しく触ったページ
const SCROLLS = z.record(z.string(), PAGE_SCROLL)
export type Scrolls = z.infer<typeof SCROLLS>

export const SCROLL_STATE = kit.definePluginState({
  id: "scroll-memory",
  scope: "stage",
  schema: SCROLLS,
  address: "replace",
})

// ページ page の pane の位置を top にした記憶（page を新しい側に置き、MAX_REMEMBERED を超えた古いページは忘れる）
export function remember(scrolls: Scrolls | undefined, page: string, patch: PageScroll): Scrolls {
  const { [page]: now, ...others } = scrolls ?? {}
  const all = Object.entries({ ...others, [page]: { ...now, ...patch } })
  return Object.fromEntries(all.slice(-MAX_REMEMBERED))
}

// ページ page を開いたとき戻す、pane の位置（覚えていなければ先頭）
export const positionOf = (scrolls: Scrolls | undefined, page: string, pane: Pane): number =>
  scrolls?.[page]?.[pane] ?? 0
