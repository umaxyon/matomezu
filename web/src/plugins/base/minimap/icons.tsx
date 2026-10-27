// ミニマップのコマンドのアイコン（紙の中に、見えている範囲の四角）
import { icon } from "../icon"
import { MINIMAP_TOGGLE } from "."

export const MINIMAP = icon(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <rect x="12" y="7" width="6" height="5" rx="1" />
  </>,
)

export const MINIMAP_ICONS = { [MINIMAP_TOGGLE.id]: MINIMAP }
