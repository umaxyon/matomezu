// ユーザーが用意した、matomezu のアイコン（svg。24 の四角の固定色）

export const FileIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    aria-hidden="true"
    fill="#947EB6"
    stroke="#947EB6"
    strokeWidth="0.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 2h9l5 5v15H5Z" fill="#EEE6F7" strokeWidth="1.6" />
    <path d="M14 2v5h5" fill="none" strokeWidth="1.6" />
  </svg>
)
