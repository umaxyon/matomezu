// matomezu のアイコン（svg を写した物。24 の四角の固定色）

export const ImageIcon = ({ size = 16 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none">
    <rect x="1.75" y="3.75" width="20.5" height="16.5" rx="2.25" fill="#5B9A6E" />
    <circle cx="8" cy="9" r="2" fill="#fff" />
    <path d="M3.5 18.5 9 13l3 3 4-4.5 4.5 5v2Z" fill="#CDE8D4" />
  </svg>
)
