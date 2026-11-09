// スライドのアイテム 1 つの絵: 書いた位置と大きさに、角度（rotation）を枠の中心でかけて、アイテムのビューを描く。
// 操作を受けるレイヤー（SlideLayer）は edit を渡す: アイテムに操作の印（data-item）とアンカーを付け、文字枠は書き換え中ならテキストForm にする。
import { type ReactNode, useRef, useState } from "react"
import type { PlacedShape } from "../../../../plugin-api"
import { type ItemViewProps, useUiCatalog } from "../../../../plugin-api/ui"
import { useAnchorRef } from "../../../base/ui"
import { DEFAULT_FONT_SIZE } from "../slide"
import styles from "./SlideLayer.module.css"

export const shapeProps = (shape: PlacedShape): Record<string, unknown> => shape.props as Record<string, unknown>
export const rotationOf = (shape: PlacedShape): number => (shapeProps(shape).rotation as number | undefined) ?? 0

export interface SlideItemEdit {
  editing: boolean
  onCommit: (text: string) => void
  onCancel: () => void
}

export function SlideItem({
  shape,
  stage,
  zoom,
  edit,
}: {
  shape: PlacedShape
  stage: string
  zoom: number
  edit?: SlideItemEdit
}) {
  const ui = useUiCatalog()
  const anchor = useAnchorRef()
  const View = ui.items.get(shape.item)?.view as
    | ((p: ItemViewProps<PlacedShape["props"]>) => ReactNode)
    | React.ComponentType<ItemViewProps<PlacedShape["props"]>>
    | undefined
  const size = { w: shape.w ?? 0, h: shape.h ?? 0 }
  const rotation = rotationOf(shape)
  return (
    <div
      ref={edit ? anchor(shape.id) : undefined}
      data-item={edit ? shape.id : undefined}
      className={styles.item}
      style={{
        left: shape.x,
        top: shape.y,
        width: size.w,
        height: size.h,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        cursor: edit ? undefined : "default",
      }}
    >
      {edit?.editing ? (
        <TextEditor shape={shape} onCommit={edit.onCommit} onCancel={edit.onCancel} />
      ) : (
        View && (
          <View
            props={shape.props}
            size={size}
            id={shape.id}
            stage={stage}
            content={{}}
            zoom={zoom}
            hasChildren={false}
          />
        )
      )}
    </div>
  )
}

// 文字枠の文字を書き換えるテキストForm（文字枠と同じ文字の大きさ・そろえ）。外へ出ると決め、Escape でやめる
function TextEditor({
  shape,
  onCommit,
  onCancel,
}: {
  shape: PlacedShape
  onCommit: (text: string) => void
  onCancel: () => void
}) {
  const props = shape.props as { text?: string; fontSize?: number; align?: "left" | "center" | "right" }
  const [text, setText] = useState(props.text ?? "")
  const cancelled = useRef(false)
  return (
    <textarea
      className={styles.editor}
      // biome-ignore lint/a11y/noAutofocus: 文字を書き換え始めたときに、そのまま打てるようにする
      autoFocus
      value={text}
      style={{ fontSize: props.fontSize ?? DEFAULT_FONT_SIZE, textAlign: props.align ?? "left" }}
      onFocus={e => e.currentTarget.setSelectionRange(text.length, text.length)}
      onChange={e => setText(e.target.value)}
      onBlur={() => (cancelled.current ? onCancel() : onCommit(text))}
      onKeyDown={e => {
        if (e.key === "Escape") {
          cancelled.current = true
          e.stopPropagation()
          e.currentTarget.blur()
        }
      }}
    />
  )
}
