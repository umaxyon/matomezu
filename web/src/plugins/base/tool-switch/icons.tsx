// base の道具のアイコン（24 の四角の中に描く線。見た目の重心をそろえるため、少しずらしてある）
import { icon } from "../icon"
import { HAND_TOOL, SELECT_TOOL } from "./tools"

export const TOOL_ICONS = {
  [SELECT_TOOL.id]: icon(<path transform="translate(0.67 0)" d="M6.35 3v16l4.5-4.2 3 6.7 2.6-1.2-3-6.6h5.9z" />),
  [HAND_TOOL.id]: icon(
    <g transform="translate(0 1.33)">
      <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M11 11.5v-8a1.5 1.5 0 0 1 3 0V12" />
      <path d="M14 12V5.5a1.5 1.5 0 0 1 3 0V13" />
      <path d="M17 8.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-2a6 6 0 0 1-4.9-2.5L4.2 14.3a1.5 1.5 0 0 1 2.3-2l1.5 1.7" />
    </g>,
  ),
}
