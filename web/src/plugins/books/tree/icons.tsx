// 伸びる向きのアイコン（上へ・下へ・左へ・右へ・中央から）と、編集の道具のアイコン（鉛筆。24 の四角の中に描く線）
import type { ReactNode } from "react"
import type { Grow } from "./grow"
import { EDIT_TOOL } from "./tools"

const arrow = (d: string) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
)

export const GROW_ICONS: Readonly<Record<Grow, ReactNode>> = {
  up: arrow("M12 20V6M7 11L12 6L17 11"),
  down: arrow("M12 4V18M7 13L12 18L17 13"),
  left: arrow("M20 12H6M11 7L6 12L11 17"),
  right: arrow("M4 12H18M13 7L18 12L13 17"),
  center: arrow("M12 12V4M12 12V20M12 12H4M12 12H20M9 7L12 4L15 7M9 17L12 20L15 17M7 9L4 12L7 15M17 9L20 12L17 15"),
}

export const TREE_TOOL_ICONS = {
  [EDIT_TOOL.id]: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20l1-5L15.5 4.5a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3L9 19z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  ),
}
