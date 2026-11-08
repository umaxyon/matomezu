// 窓のコマンドのアイコン: 止まり木（横に伸びた枝と、枝の左右の小さな足がかり）
import { icon } from "../icon"
import { CONTROL_CENTER_TOGGLE } from "."

export const PERCH = icon(
  <>
    <path d="M2.5 16c3-1.2 6 0.2 9.5-0.6s6.3-1.4 9.5-0.2" />
    <path d="M7 15.4L5 8.5" />
    <path d="M6 12l-2.2-1" />
    <path d="M17 14.8l2.2-7" />
    <path d="M18.2 11l2.3-0.8" />
    <path d="M12 15.4v3.6" />
  </>,
)

export const WINDOW_ICONS = {
  [CONTROL_CENTER_TOGGLE.id]: PERCH,
}
