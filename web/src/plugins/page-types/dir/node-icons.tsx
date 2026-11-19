// matomezu のアイコン（svg を写した物。24 の四角の固定色）

export const ClassDiagramIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    aria-hidden="true"
    fill="#578FA4"
    stroke="#578FA4"
    strokeWidth="0.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M8 10v7h7" fill="none" strokeWidth="2" />
    <rect x="1" y="1" width="14" height="10" rx="1.3" />
    <path d="M2 5h12" stroke="#fff" strokeWidth="1.5" />
    <rect x="10" y="14" width="13" height="9" rx="1.3" />
    <path d="M11 18h11" stroke="#fff" strokeWidth="1.5" />
  </svg>
)

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

export const HtmlIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    aria-hidden="true"
    fill="#C67847"
    stroke="#C67847"
    strokeWidth="0.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="1" y="3" width="22" height="18" rx="2" />
    <path d="M2 7h20m-14 4-3 3 3 3m8-6 3 3-3 3m-3-6-2 6" stroke="#fff" strokeWidth="1.7" fill="none" />
  </svg>
)
