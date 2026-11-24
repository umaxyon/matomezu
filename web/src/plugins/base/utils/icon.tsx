// 24 の四角の中に描く線のアイコンの形: メニューに出すコマンドのアイコン icon（線の太さと大きさはメニューが決める）と、
// 画面に置く線画のアイコン LineIcon（色は currentColor、大きさ size と線の太さ stroke は置く側が決める）と、開閉の印の右向きの山 ChevronIcon（開いたら置く側が回す）
import type { ReactNode } from "react"

export const icon = (paths: ReactNode) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {paths}
  </svg>
)

export function LineIcon({
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

export const ChevronIcon = ({ size, className }: { size: number; className?: string }) => (
  <LineIcon size={size} stroke={1.8} className={className}>
    <path d="M9 6l6 6-6 6" />
  </LineIcon>
)
