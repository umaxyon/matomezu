// 流れの向きのアイコン（下へ・右へ）
export const DIRECTION_ICONS = {
  down: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4V18M7 13L12 18L17 13" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  right: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12H18M13 7L18 12L13 17" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
} as const
