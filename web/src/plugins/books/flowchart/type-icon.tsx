// matomezu のアイコン（svg を写した物。24 の四角の固定色）

export const FlowchartIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    aria-hidden="true"
    fill="#9170BD"
    stroke="#9170BD"
    strokeWidth=".5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m7.5 1.5 6 6-6 6-6-6Z" />
    <path d="M7.5 12v6H16" fill="none" strokeWidth="2" />
    <rect x="15" y="14" width="8" height="8" rx="1.5" />
  </svg>
)
