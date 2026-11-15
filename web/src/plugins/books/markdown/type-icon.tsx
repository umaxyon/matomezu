// ユーザーが用意した、matomezu のアイコン（svg。24 の四角の固定色）

export const MarkdownIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    aria-hidden="true"
    fill="#72849F"
    stroke="#72849F"
    strokeWidth=".5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="1" y="4" width="22" height="16" rx="2.5" />
    <path d="M5 15V9l3 3.5L11 9v6m6-6v6m-2.5-2.5L17 15l2.5-2.5" stroke="#fff" fill="none" strokeWidth="1.8" />
  </svg>
)
