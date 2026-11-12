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
