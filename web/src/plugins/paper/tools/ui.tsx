// 紙の道具の見た目: 付け替えの道具のアイコン（24 の四角の中に描く線。見た目の重心をそろえるため、少しずらしてある）
import { REPARENT_TOOL } from "."

export const PAPER_TOOL_ICONS = {
  [REPARENT_TOOL.id]: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g transform="translate(-1.33 0)">
        <path d="M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" />
        <path d="M3 12h12" />
        <path d="m11 8 4 4-4 4" />
      </g>
    </svg>
  ),
}
