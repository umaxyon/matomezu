// フォルダの絵: 閉じたフォルダと開いたフォルダ（24 の四角の固定色）

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

export const DocumentsFolderIcon = ({ size = 16 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none">
    <path d="M3 4h12l3 3v12H3z" fill="#657B98" />
    <path d="M7 2h10l4 4v16H7z" fill="#B6C7DA" />
    <path d="M17 2v4h4" fill="#E8EFF7" />
    <path d="M10 10h8m-8 4h6m-6 4h5" stroke="#405675" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)

export const WorkroomsFolderIcon = ({ size = 16 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none">
    <rect x="5" y="2" width="14" height="10" rx="1.6" fill="#775AA7" />
    <path d="M8 5h8v4H8Z" fill="#DFD2F3" />
    <path d="M11 11h2v4h-2zM2 14h20v3H2zM4 17h2.5v5H4zm13.5 0H20v5h-2.5z" fill="#775AA7" />
  </svg>
)
