// ブックの絵: 閉じた本と開いた本（24 の四角の固定色）

export const BookIcon = ({ size = 16 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none">
    <path d="M6 2h15v20H6a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Z" fill="#4E82C2" />
    <path d="M6.5 17H21v3H6.5a1.5 1.5 0 0 1 0-3Z" fill="#DCE8F7" />
    <path d="M7.5 18.5H21" stroke="#A2BBD9" strokeWidth=".8" strokeLinecap="round" />
    <path d="M7 3.5v11.75" stroke="#35679F" strokeWidth="1.25" strokeLinecap="round" />
    <path d="M11 6h6M11 9h4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)

export const BookOpenIcon = ({ size = 16 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none">
    <g transform="translate(0 .75) scale(1 .95)">
      <path d="M6 3.5h15V22H6a3 3 0 0 1-3-3V6.5a3 3 0 0 1 3-3Z" fill="#4E82C2" />
      <path d="M6 3.5h15V17H6Z" fill="#EDF3FA" />
      <path d="M6.5 17H21v3H6.5a1.5 1.5 0 0 1 0-3Z" fill="#DCE8F7" />
      <path d="M7.5 18.5H21M16 7h3M16 10h3" stroke="#A2BBD9" strokeWidth=".8" strokeLinecap="round" />
      <path d="M5 3.5 17.3 0V15.5L5 18.5Z" fill="#4E82C2" />
      <path d="M5 4v14" stroke="#35679F" strokeWidth="1.2" strokeLinecap="round" />
      <path d="m8 5.5 5-1.30M8 8.5l3.7-.97" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    </g>
  </svg>
)
