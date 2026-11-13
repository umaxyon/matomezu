// タスクボードの画面で使う線画のアイコン（SVG。色は currentColor、大きさは各アイコンが決める）
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

export const GripIcon = () => (
  <Svg size={14} stroke={0}>
    {[9, 15].flatMap(x => [6, 12, 18].map(y => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="currentColor" />))}
  </Svg>
)

export const MaximizeIcon = () => (
  <Svg size={16}>
    <rect x="5" y="5" width="14" height="14" rx="1.5" />
  </Svg>
)

export const RestoreIcon = () => (
  <Svg size={16}>
    <rect x="4.5" y="8.5" width="11" height="11" rx="1.5" />
    <path d="M8.5 8.5v-3a1.5 1.5 0 0 1 1.5-1.5h8a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-3" />
  </Svg>
)

export const ChevronIcon = ({ className }: { className?: string }) => (
  <Svg size={14} stroke={1.8} className={className}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
)

export const SortIcon = () => (
  <Svg size={14} stroke={1.7}>
    <path d="M8 19V5M4.5 8.5L8 5l3.5 3.5M16 5v14M12.5 15.5L16 19l3.5-3.5" />
  </Svg>
)

// チケットスクリーンの線画のアイコン（16px の格子）
export const BackIcon = () => (
  <Svg size={16} stroke={2}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
)

export const PencilIcon = () => (
  <Svg size={16} stroke={2}>
    <path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" />
    <path d="M14 7l3 3" />
  </Svg>
)

export const BookIcon = () => (
  <Svg size={16} stroke={2}>
    <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z" />
    <path d="M5 17a3 3 0 0 1 3-3h11" />
  </Svg>
)

// 利用者（鳥でない書いた者）の印
export const UserIcon = () => (
  <Svg size={16} stroke={2}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20c1.2-4 4-5.5 7.5-5.5s6.3 1.5 7.5 5.5" />
  </Svg>
)

// 照準（ボードで見る）
export const TargetIcon = () => (
  <Svg size={16} stroke={1.8}>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="1.5" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
  </Svg>
)

// 歯車（プロジェクト設定を開く）
export const GearIcon = () => (
  <Svg size={16}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8l1.6 2.3 2.7-.6.9 2.6 2.6.9-.6 2.7 2.3 1.6-2.3 1.6.6 2.7-2.6.9-.9 2.6-2.7-.6L12 21.2l-1.6-2.3-2.7.6-.9-2.6-2.6-.9.6-2.7L2.5 12l2.3-1.6-.6-2.7 2.6-.9.9-2.6 2.7.6z" />
  </Svg>
)
