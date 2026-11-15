// ユーザーが用意した、matomezu のアイコン（svg。24 の四角の固定色）

export const DirectoryIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    aria-hidden="true"
    fill="#BE9239"
    stroke="#BE9239"
    strokeWidth=".5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 10v10h11M3 14h11" fill="none" strokeWidth="2" />
    <path d="M1 2h6l2 2h6v7H1Z" />
    <path d="M12 12h10v5H12ZM12 19h10v4H12Z" />
  </svg>
)
