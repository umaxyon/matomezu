// アイテムのアイコン（ツールボックスなどに出す）
export const BOX_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="4" y="7" width="16" height="10" rx="1.5" />
  </svg>
)

// 寄せのアイコン（左・中央・右に寄せた横線）
const lines = (x1: number, x2: number) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={`M4 6h16M${x1} 12h${x2 - x1}M4 18h16`} />
  </svg>
)
export const ALIGN_ICONS = { left: lines(4, 14), center: lines(7, 17), right: lines(10, 20) }
