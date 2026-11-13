// 画面で使う線画のアイコン（SVG。色は currentColor、大きさは各アイコンが決める）
import type { ReactNode } from "react"

function Svg({
  size,
  stroke = 1.6,
  className,
  children,
}: {
  size: number
  stroke?: number
  className?: string
  children: ReactNode
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {children}
    </svg>
  )
}

export const MailIcon = () => (
  <Svg size={15}>
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <path d="M3.5 7l8.5 6.5L20.5 7" />
  </Svg>
)

export const LibraryIcon = () => (
  <Svg size={15}>
    <path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5z" />
    <path d="M12 6.5v13" />
  </Svg>
)

export const ProjectIcon = () => (
  <Svg size={15}>
    <path d="M3.5 6.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" />
  </Svg>
)

export const GearIcon = () => (
  <Svg size={16}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8l1.6 2.3 2.7-.6.9 2.6 2.6.9-.6 2.7 2.3 1.6-2.3 1.6.6 2.7-2.6.9-.9 2.6-2.7-.6L12 21.2l-1.6-2.3-2.7.6-.9-2.6-2.6-.9.6-2.7L2.5 12l2.3-1.6-.6-2.7 2.6-.9.9-2.6 2.7.6z" />
  </Svg>
)

export const AvatarIcon = () => (
  <Svg size={32} stroke={1.5}>
    <circle cx="12" cy="12" r="10.5" />
    <circle cx="12" cy="9.5" r="3.4" />
    <path d="M5.8 19.2c1.2-3.2 3.6-4.7 6.2-4.7s5 1.5 6.2 4.7" />
  </Svg>
)

export const ChevronIcon = ({ className }: { className?: string }) => (
  <Svg size={14} stroke={1.8} className={className}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
)

export const BackIcon = () => (
  <Svg size={16} stroke={1.8}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
)

export const PencilIcon = () => (
  <Svg size={14}>
    <path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 0l.5.5a2.1 2.1 0 0 1 0 3L8.5 19z" />
    <path d="M13.5 7l3.5 3.5" />
  </Svg>
)

// 並べ替え（上と下の矢印）
export const SortIcon = () => (
  <Svg size={14} stroke={1.7}>
    <path d="M8 19V5M4.5 8.5L8 5l3.5 3.5M16 5v14M12.5 15.5L16 19l3.5-3.5" />
  </Svg>
)

// 退室（ドアから外へ出る矢印）
export const LeaveIcon = () => (
  <Svg size={16} stroke={1.7}>
    <path d="M10 4H6a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6 20h4" />
    <path d="M14 8l4 4-4 4M18 12H9.5" />
  </Svg>
)

// そこへ移って見せる（照準: 丸と四方の線）
export const LocateIcon = () => (
  <Svg size={14} stroke={1.7}>
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    <path d="M12 2.5v3.5M12 18v3.5M2.5 12H6M18 12h3.5" />
  </Svg>
)

// ブック 1 冊（ナレッジの、本文など）
export const BookIcon = () => (
  <Svg size={20} stroke={1.5}>
    <path d="M6 3.5h11.5v15H7a1.5 1.5 0 0 0-1.5 1.5V5A1.5 1.5 0 0 1 6 3.5z" />
    <path d="M5.5 20a1.5 1.5 0 0 1 1.5-1.5h10.5V21H7a1.5 1.5 0 0 1-1.5-1z" />
    <path d="M9 8h5.5M9 11h5.5" />
  </Svg>
)

// つまんでドラッグする所の印（縦に 2 列 3 段の点）
export const GripIcon = () => (
  <Svg size={14} stroke={0}>
    {[9, 15].flatMap(x => [6, 12, 18].map(y => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="currentColor" />))}
  </Svg>
)

// 管理者の王冠（塗りは currentColor、縁は使う側が stroke で決める）
export const CrownIcon = ({ width = 18 }: { width?: number }) => (
  <svg
    viewBox="0 0 24 14"
    width={width}
    height={(width * 14) / 24}
    aria-hidden="true"
    fill="currentColor"
    strokeWidth={1}
  >
    <path d="M2 12L1 3l5.5 4.5L12 1l5.5 6.5L23 3l-1 9z" strokeLinejoin="round" />
  </svg>
)

export const SearchIcon = () => (
  <Svg size={15}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="M15 15l5.5 5.5" />
  </Svg>
)
