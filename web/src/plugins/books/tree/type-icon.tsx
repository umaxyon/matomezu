// matomezu のアイコン（svg を写した物。24 の四角の固定色）

export const TreeIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    aria-hidden="true"
    fill="#3D947D"
    stroke="#3D947D"
    strokeWidth=".5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 8v5M4.5 17v-4h15v4" fill="none" strokeWidth="2" />
    <rect x="8" y="2" width="8" height="7" rx="1.4" />
    <rect x="1" y="16" width="7" height="6" rx="1.2" />
    <rect x="16" y="16" width="7" height="6" rx="1.2" />
  </svg>
)
