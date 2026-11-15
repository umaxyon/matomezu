// matomezu のアイコン（svg を写した物。24 の四角の固定色）

export const SlideIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    aria-hidden="true"
    fill="#CA8055"
    stroke="#CA8055"
    strokeWidth=".5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="1" y="3" width="22" height="15" rx="2" />
    <path d="M12 18v4m-4 0h8" fill="none" strokeWidth="2" />
    <path d="M5 7h10M5 11h5" fill="none" stroke="#fff" strokeWidth="1.8" />
    <path d="m16 10 4 5h-8Z" fill="#fff" stroke="none" />
  </svg>
)
