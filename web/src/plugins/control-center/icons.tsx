// 画面で使う線画のアイコン（SVG。色は currentColor、大きさは各アイコンが決める）
import type { ReactNode } from "react"

function Svg({ size, stroke = 1.6, children }: { size: number; stroke?: number; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
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

// 退室（ドアから外へ出る矢印）
export const LeaveIcon = () => (
  <Svg size={16} stroke={1.7}>
    <path d="M10 4H6a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6 20h4" />
    <path d="M14 8l4 4-4 4M18 12H9.5" />
  </Svg>
)

// ごみ箱（空室の部屋を削除する）
export const TrashIcon = () => (
  <Svg size={16} stroke={1.7}>
    <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7M10 11v5M14 11v5" />
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
