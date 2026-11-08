// スライドのビュー（見せ方 slide）: ブックのビューのレイヤー（book-content）が描く。紙の枠の中に、開いたページの slide のアイテムを重ねの順に描く。
// アイテムは書いた位置と大きさ（紙の左上から。負でも、紙より大きくてもよい）に置き、角度（rotation）は枠の中心でかける。紙の外にはみ出た部分は切る。
// 選ぶ・動かす・大きさを変える操作はまだ無い
import type { ReactNode } from "react"
import { type PlacedShape, type StageView, slideOf } from "../../../plugin-api"
import {
  type BookViewProps,
  type ItemViewProps,
  useMessages,
  useShownPage,
  useStage,
  useUiCatalog,
} from "../../../plugin-api/ui"
import { PaperFrame } from "../../base/ui"
import { kit } from "./kit"
import styles from "./SlideView.module.css"

export function SlideView({ stage: id }: BookViewProps) {
  const stage = useStage(id)
  if (!stage) return null
  return <Page stage={stage} />
}

function Page({ stage }: { stage: StageView }) {
  const t = useMessages(kit)
  const page = useShownPage(stage.id)
  const ui = useUiCatalog()
  if (stage.opened?.page === null) return <p className={styles.empty}>{t("No slides yet")}</p>
  const shapes = page ? slideOf(page) : []
  return (
    <PaperFrame stage={stage} className={styles.paper} style={{ overflow: "hidden" }}>
      {shapes.map(shape => (
        <Shape key={shape.id} shape={shape} stage={stage} view={ui.items.get(shape.item)?.view} />
      ))}
    </PaperFrame>
  )
}

function Shape({
  shape,
  stage,
  view,
}: {
  shape: PlacedShape
  stage: StageView
  view: ((p: ItemViewProps<never, never>) => ReactNode) | React.ComponentType<ItemViewProps<never, never>> | undefined
}) {
  const View = view as React.ComponentType<ItemViewProps<PlacedShape["props"]>> | undefined
  const size = { w: shape.w ?? 0, h: shape.h ?? 0 }
  const rotation = (shape.props as { rotation?: number }).rotation
  return (
    <div
      data-item={shape.id}
      className={styles.item}
      style={{
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
          stage={stage.id}
          content={{}}
          zoom={stage.zoom}
          hasChildren={false}
        />
      )}
    </div>
  )
}
