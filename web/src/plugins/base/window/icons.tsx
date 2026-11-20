// 窓のコマンドのアイコン: 巣箱（斜めから見た屋根と箱、正面の丸い入口、その下の止まり棒と支柱）
import { icon } from "../utils/icon"
import { CONTROL_CENTER_TOGGLE } from "."

export const BIRDHOUSE = icon(
  <>
    <path d="m2 9 7-7 9 1 5 7-8-1-6-7M4 7v11l11 1 6-3v-6M15 9v10" />
    <circle cx="9.3" cy="11" r="2.2" />
    <path d="M7 15.5h4.5M11.5 18.7V23M9 23h5" />
  </>,
)

export const WINDOW_ICONS = {
  [CONTROL_CENTER_TOGGLE.id]: BIRDHOUSE,
}
