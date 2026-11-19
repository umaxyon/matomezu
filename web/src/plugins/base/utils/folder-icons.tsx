// フォルダの絵: 閉じたフォルダと開いたフォルダ（24 の四角の固定色。書庫とディレクトリ構成図が使う）

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
