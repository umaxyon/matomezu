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
