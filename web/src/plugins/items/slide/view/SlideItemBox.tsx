// スライドのアイテム 1 つを描く箱: 紙の上の位置と大きさ rect に、回転 rotation（度）で置き、中身 children を描く（スライドの上と、刷る紙とで同じ形）
import type { CSSProperties, ReactNode, Ref } from "react"
import type { Rect } from "../../../../plugin-api"

export function SlideItemBox({
  rect,
  rotation,
  tokens,
  className,
  ref,
  item,
  cursor,
  children,
}: {
  rect: Rect
  rotation: number
  tokens: CSSProperties // アイテムのテーマキーの値（useSlideItemView）
  className: string | undefined
  ref?: Ref<HTMLDivElement>
  item?: string // data-item に出すアイテムの id（操作を受ける箱だけ）
  cursor?: CSSProperties["cursor"]
  children: ReactNode
}) {
  return (
    <div
      ref={ref}
      data-item={item}
      className={className}
      style={{
        ...tokens,
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        cursor,
      }}
    >
      {children}
    </div>
  )
}
