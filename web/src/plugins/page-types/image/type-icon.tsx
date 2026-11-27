// matomezu のアイコン（svg を写した物。24 の四角の固定色）

export const ImageIcon = ({ size = 16 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none">
    <rect x="1.75" y="3.75" width="20.5" height="16.5" rx="2.25" fill="#5B9A6E" />
    <circle cx="8" cy="9" r="2" fill="#fff" />
    <path d="M3.5 18.5 9 13l3 3 4-4.5 4.5 5v2Z" fill="#CDE8D4" />
  </svg>
)

export const ImagesFolderIcon = ({ size = 16 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none">
    <rect x="5.5" y="3" width="16.5" height="13" rx="2" fill="#8CBAAA" />
    <rect x="2" y="8" width="17" height="13" rx="2" fill="#377E68" />
    <path d="m4.5 18.5 4-5 3 3.1 2.2-2.3 2.8 4.2z" fill="#E7F3EB" />
    <circle cx="14.5" cy="11.8" r="1.35" fill="#E7F3EB" />
  </svg>
)
