// スライドの印刷区画 1 つのビュー（印刷プレビューと印刷。ブックのビューの定義の printSheet）: ページの slide のアイテムを、見るだけで描く。
// 入力は受けない。紙の外にはみ出た所は、紙の境目で切れる。アイテムの絵は、アイテムの定義の見た目（ui 台帳）で引く
import type { ReactNode } from "react"
import { type ItemPage, type PlacedShape, slideOf } from "../../../../plugin-api"
import { type ItemViewProps, useStage, useTokenScope, useUiCatalog } from "../../../../plugin-api/ui"
import type { PrintSheetProps } from "../../../base/ui"
import styles from "./SlideSheet.module.css"

type ShapeView = (p: ItemViewProps<PlacedShape["props"]>) => ReactNode

export function SlideSheet({ stage: id, page }: PrintSheetProps) {
  const stage = useStage(id)
  if (!stage) return null
  return (
    <>
      {slideOf(page as ItemPage).map(shape => (
        <SheetShape key={shape.id} shape={shape} stage={id} zoom={stage.zoom} />
      ))}
    </>
  )
}

// アイテム 1 つ（そのアイテムのプラグインのテーマキー --<名前> を、描く要素に置く）
function SheetShape({ shape, stage, zoom }: { shape: PlacedShape; stage: string; zoom: number }) {
  const ui = useUiCatalog()
  const tokens = useTokenScope(shape.item)
  const View = ui.items.get(shape.item)?.view as ShapeView | undefined
  const size = { w: shape.w ?? 0, h: shape.h ?? 0 }
  const rotation = (shape.props as { rotation?: number }).rotation ?? 0
  return (
    <div
      className={styles.item}
      style={{
        ...tokens,
        left: shape.x,
        top: shape.y,
        width: size.w,
        height: size.h,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
      }}
    >
      {View && (
        <View
          props={shape.props}
          size={size}
          id={shape.id}
          stage={stage}
          content={{}}
          zoom={zoom}
          hasChildren={false}
        />
      )}
    </div>
  )
}
