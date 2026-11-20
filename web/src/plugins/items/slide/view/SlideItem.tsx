// スライドのアイテム 1 つの絵: 書いた位置と大きさに、角度（rotation）を枠の中心でかけて、アイテムのビューを描く。
// 操作を受けるレイヤー（SlideLayer）は edit を渡す: アイテムに操作の印（data-item）とアンカーを付け、文字枠は書き換え中ならテキストForm にする。
import { useLayoutEffect, useRef, useState } from "react"
import type { PlacedShape, Rect } from "../../../../plugin-api"
import { useAnchorRef } from "../../../base/ui"
import { fittedRect, rotationOf } from "../rect"
import { DEFAULT_FONT_SIZE, TEXT_LINE_HEIGHT } from "../slide"
import face from "../TextFace.module.css"
import { textFitSize, wrapsIn } from "../text-fit"
import { useSlideItemView } from "./item-view"
import { SlideItemBox } from "./SlideItemBox"
import styles from "./SlideLayer.module.css"

export interface SlideItemEdit {
  editing: boolean
  // 書き換えを終える。text は書いた文字、grown は書いている間に文字に合わせた枠（変えなかったら null）
  onCommit: (text: string, grown: Rect | null) => void
  onCancel: () => void
}

export function SlideItem({ shape, zoom, edit }: { shape: PlacedShape; zoom: number; edit?: SlideItemEdit }) {
  const anchor = useAnchorRef()
  const { View, tokens } = useSlideItemView(shape.item)
  const [grown, setGrown] = useState<Rect | null>(null) // 書き換えている間、文字に合わせた枠
  const editing = edit?.editing === true
  const rect = editing && grown ? grown : { x: shape.x, y: shape.y, w: shape.w ?? 0, h: shape.h ?? 0 }
  const size = { w: rect.w, h: rect.h }
  const rotation = rotationOf(shape)
  return (
    <SlideItemBox
      rect={rect}
      rotation={rotation}
      tokens={tokens}
      className={styles.item}
      ref={edit ? anchor(shape.id) : undefined}
      item={edit ? shape.id : undefined}
      cursor={edit ? undefined : "default"}
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
        View && <View props={shape.props} size={size} id={shape.id} content={{}} zoom={zoom} hasChildren={false} />
      )}
    </SlideItemBox>
  )
}

// 文字枠の文字を書き換えるテキストForm（文字枠と同じ文字の大きさ・そろえ）。外へ出ると決め、Escape でやめる。
// 書いている間、枠を文字の幅と高さに寄せる（増えれば広がり、減れば縮む。左上の角は動かない）。
// 始めから折り返している枠（狭くした枠）は幅を変えず、高さだけを文字に寄せる。文字を変えるまでは枠を変えない
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
  const base = useRef<Rect>({ x: shape.x, y: shape.y, w: shape.w ?? 0, h: shape.h ?? 0 })
  const first = useRef(props.text ?? "")
  const last = useRef<{ w: number; h: number }>({ w: base.current.w, h: base.current.h })
  const size = props.fontSize ?? DEFAULT_FONT_SIZE
  const style = {
    fontSize: size,
    lineHeight: TEXT_LINE_HEIGHT,
    textAlign: props.align ?? "left",
    whiteSpace: wraps === true ? ("pre-wrap" as const) : ("pre" as const),
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: text が変わるたびと、折り返す枠かが決まったときに寄せる
  useLayoutEffect(() => {
    if (wraps === null) {
      setWraps(wrapsIn(text, size, base.current.w))
      return
    }
    if (text === first.current) return
    const fit = textFitSize(text, size, wraps ? base.current.w : null)
    if (fit.w === last.current.w && fit.h === last.current.h) return
    last.current = fit
    onGrow(fittedRect(base.current, rotation, fit))
  }, [text, wraps])
  return (
    <textarea
      ref={area}
      className={`${styles.editor} ${face.face}`}
      // biome-ignore lint/a11y/noAutofocus: 文字を書き換え始めたときに、そのまま打てるようにする
      autoFocus
      wrap={wraps === true ? "soft" : "off"}
      value={text}
      style={style}
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
