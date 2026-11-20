// 設定の歯車: 設定を開くコマンドのアイコン GEAR_ICON と、ボタンに置く GearIcon（同じ形）
import { icon, LineIcon } from "./icon"

const GEAR = (
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8l1.6 2.3 2.7-.6.9 2.6 2.6.9-.6 2.7 2.3 1.6-2.3 1.6.6 2.7-2.6.9-.9 2.6-2.7-.6L12 21.2l-1.6-2.3-2.7.6-.9-2.6-2.6-.9.6-2.7L2.5 12l2.3-1.6-.6-2.7 2.6-.9.9-2.6 2.7.6z" />
  </>
)

export const GEAR_ICON = icon(GEAR)

export const GearIcon = ({ size = 16 }: { size?: number }) => <LineIcon size={size}>{GEAR}</LineIcon>
