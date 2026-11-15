// matomezu のアイコン（svg を写した物。24 の四角の固定色）

export const DrawingIcon = ({ size = 16 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none">
    <path
      d="M4 2.75h9a2.25 2.25 0 0 1 2.25 2.25v4.292A6.75 6.75 0 0 0 9.255 16.25H4A2.25 2.25 0 0 1 1.75 14V5A2.25 2.25 0 0 1 4 2.75Z"
      fill="#4E82C2"
    />
    <circle cx="16" cy="16" r="5.25" fill="#A9C9EF" />
  </svg>
)
