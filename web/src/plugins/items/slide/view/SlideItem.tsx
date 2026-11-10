// スライドのアイテム 1 つの絵: 書いた位置と大きさに、角度（rotation）を枠の中心でかけて、アイテムのビューを描く。
// 操作を受けるレイヤー（SlideLayer）は edit を渡す: アイテムに操作の印（data-item）とアンカーを付け、文字枠は書き換え中ならテキストForm にする。
import { type ReactNode, useLayoutEffect, useRef, useState } from "react"
import type { PlacedShape, Rect } from "../../../../plugin-api"
import { type ItemViewProps, useTokenScope, useUiCatalog } from "../../../../plugin-api/ui"
import { useAnchorRef } from "../../../base/ui"
import { grownRect } from "../rect"
import { DEFAULT_FONT_SIZE, TEXT_LINE_HEIGHT } from "../slide"
import styles from "./SlideLayer.module.css"

export const shapeProps = (shape: PlacedShape): Record<string, unknown> => shape.props as Record<string, unknown>
export const rotationOf = (shape: PlacedShape): number => (shapeProps(shape).rotation as number | undefined) ?? 0

export interface SlideItemEdit {
  editing: boolean
  // 書き換えを終える。text は書いた文字、grown は書いている間に広げた枠（広げなかったら null）
  onCommit: (text: string, grown: Rect | null) => void
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
  const tokens = useTokenScope(shape.item) // このアイテムのプラグインのテーマキー（--<名前>）
  const View = ui.items.get(shape.item)?.view as
    | ((p: ItemViewProps<PlacedShape["props"]>) => ReactNode)
    | React.ComponentType<ItemViewProps<PlacedShape["props"]>>
    | undefined
  const [grown, setGrown] = useState<Rect | null>(null) // 書き換えている間、文字に合わせて広げた枠
  const editing = edit?.editing === true
  const rect = editing && grown ? grown : { x: shape.x, y: shape.y, w: shape.w ?? 0, h: shape.h ?? 0 }
  const size = { w: rect.w, h: rect.h }
  const rotation = rotationOf(shape)
  return (
    <div
      ref={edit ? anchor(shape.id) : undefined}
      data-item={edit ? shape.id : undefined}
      className={styles.item}
      style={{
        ...tokens,
        left: rect.x,
        top: rect.y,
        width: size.w,
        height: size.h,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        cursor: edit ? undefined : "default",
      }}
    >
      {edit && editing ? (
        <TextEditor
          shape={shape}
          onGrow={setGrown}
          onCommit={text => {
            const done = grown
            setGrown(null)
            edit.onCommit(text, done)
          }}
          onCancel={() => {
            setGrown(null)
            edit.onCancel()
          }}
        />
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

// 文字枠の文字を書き換えるテキストForm（文字枠と同じ文字の大きさ・そろえ）。外へ出ると決め、Escape でやめる。
// 文字が枠に収まらなければ、右と下へ広げる（減っても縮めない）。始めから折り返している枠（狭くした枠）は幅を変えず、高さだけ広げる
function TextEditor({
  shape,
  onGrow,
  onCommit,
  onCancel,
}: {
  shape: PlacedShape
  onGrow: (rect: Rect) => void
  onCommit: (text: string) => void
  onCancel: () => void
}) {
  const props = shape.props as { text?: string; fontSize?: number; align?: "left" | "center" | "right" }
  const [text, setText] = useState(props.text ?? "")
  const [wraps, setWraps] = useState<boolean | null>(null) // 始めから折り返している枠か（始めに 1 度だけ測る）
  const cancelled = useRef(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const rotation = rotationOf(shape)
  // text が変わるたびと、折り返す枠かが決まったときに、収まるか測って広げる。幅は枠の中の幅（枠の大きさは広げた分が親から来る）
  const base = useRef<Rect>({ x: shape.x, y: shape.y, w: shape.w ?? 0, h: shape.h ?? 0 })
  const reach = useRef<{ w: number; h: number }>({ w: base.current.w, h: base.current.h })
  // biome-ignore lint/correctness/useExhaustiveDependencies: text が変わるたびに測る
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    if (wraps === null) {
      setWraps(el.scrollWidth > el.clientWidth + 1)
      return
    }
    // はみ出したときだけ広げる（文字の右にカーソルの分、少し足す）
    const w = !wraps && el.scrollWidth > el.clientWidth ? Math.ceil(el.scrollWidth) + 2 : reach.current.w
    const h = el.scrollHeight > el.clientHeight ? Math.ceil(el.scrollHeight) : reach.current.h
    if (w === reach.current.w && h === reach.current.h) return
    reach.current = { w, h }
    onGrow(grownRect(base.current, rotation, reach.current))
  }, [text, wraps])
  return (
    <textarea
      ref={area}
      className={styles.editor}
      // biome-ignore lint/a11y/noAutofocus: 文字を書き換え始めたときに、そのまま打てるようにする
      autoFocus
      wrap={wraps === true ? "soft" : "off"}
      value={text}
      style={{
        fontSize: props.fontSize ?? DEFAULT_FONT_SIZE,
        lineHeight: TEXT_LINE_HEIGHT,
        textAlign: props.align ?? "left",
        whiteSpace: wraps === true ? "pre-wrap" : "pre",
      }}
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
