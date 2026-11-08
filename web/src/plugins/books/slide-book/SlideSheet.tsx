// スライドの印刷区画 1 つのビュー（印刷プレビューと印刷。ブックのビューの定義の printSheet）: ページの slide のアイテムを、見るだけで描く。
// 入力は受けず、アイテムには e2e や操作が探す印（data-item）を付けない（同じアイテムが印刷区画の数だけ描かれるため）。紙の外にはみ出た所は、紙の境目で切れる
import type { ReactNode } from "react"
import { type ItemPage, type PlacedShape, slideOf } from "../../../plugin-api"
import { type ItemViewProps, useStage, useUiCatalog } from "../../../plugin-api/ui"
import type { PrintSheetProps } from "../../base/ui"
import styles from "./SlideView.module.css"

export function SlideSheet({ stage: id, page }: PrintSheetProps) {
  const stage = useStage(id)
  const ui = useUiCatalog()
  if (!stage) return null
  return (
    <>
      {slideOf(page as ItemPage).map(shape => {
        const View = ui.items.get(shape.item)?.view as
          | ((p: ItemViewProps<PlacedShape["props"]>) => ReactNode)
          | undefined
        const size = { w: shape.w ?? 0, h: shape.h ?? 0 }
        const rotation = (shape.props as { rotation?: number }).rotation
        return (
          <div
            key={shape.id}
            className={styles.item}
            style={{
              left: shape.x,
              top: shape.y,
              width: size.w,
              height: size.h,
              transform: rotation ? `rotate(${rotation}deg)` : undefined,
              cursor: "default",
            }}
          >
            {View && (
              <View
                props={shape.props}
                size={size}
                id={shape.id}
                stage={id}
                content={{}}
                zoom={stage.zoom}
                hasChildren={false}
              />
            )}
          </div>
        )
      })}
    </>
  )
}
