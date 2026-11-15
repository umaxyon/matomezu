// matomezu のアイコン（svg を写した物。24 の四角の固定色）

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

export const DrawingIcon = ({ size = 16 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none">
    <path
      d="M4 2.75h9a2.25 2.25 0 0 1 2.25 2.25v4.292A6.75 6.75 0 0 0 9.255 16.25H4A2.25 2.25 0 0 1 1.75 14V5A2.25 2.25 0 0 1 4 2.75Z"
      fill="#4E82C2"
    />
    <circle cx="16" cy="16" r="5.25" fill="#A9C9EF" />
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

export const FolderIcon = ({ size = 16 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none">
    <path d="M2 5h7l2 2h11v13H2Z" fill="#D4A13B" />
  </svg>
)

export const FolderOpenIcon = ({ size = 16 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none">
    <path d="M2 5h7l2 2h10v3H5.5L2 20Z" fill="#BE8C2F" />
    <path d="M2 20 5.5 10H23l-3.5 10Z" fill="#E2B34F" />
    <path d="M5.5 10H23" stroke="#F3D184" strokeWidth=".8" strokeLinejoin="round" />
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
