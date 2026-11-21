// 描画シェイプ 1 つの絵: 書いた位置と大きさに、角度（rotation）を枠の中心でかけて、アイテムのビューを描く。
// 操作を受けるレイヤー（SlideLayer）は edit を渡す: アイテムに操作の印（data-item）とアンカーを付け、文字枠は書き換え中ならテキストForm にする。
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { PlacedShape, Rect } from "../../../../plugin-api"
import { useAnchorRef, useEndWhenBlocked } from "../../../base/ui"
import { SLIDE_SET } from "../commands"
import { fittedRect, rotationOf } from "../rect"
import { SLIDE_TEXT_KEY_SCOPE } from "../scope"
import { DEFAULT_FONT_SIZE, TEXT_LINE_HEIGHT } from "../slide"
import face from "../TextFace.module.css"
import { textFitSize, wrapsIn } from "../text-fit"
import { useSlideItemView } from "./item-view"
import { SlideItemBox } from "./SlideItemBox"
import styles from "./SlideLayer.module.css"

export interface SlideItemEdit {
  editing: boolean
  // 書き換えを決める。text は書いた文字、grown は書いている間に文字に合わせた枠（変えなかったら null）。やめるのはコマンド（Escape）
  onCommit: (text: string, grown: Rect | null) => void
}

export function SlideItem({ shape, zoom, edit }: { shape: PlacedShape; zoom: number; edit?: SlideItemEdit }) {
  const anchor = useAnchorRef()
  const { View, tokens } = useSlideItemView(shape.item)
  const [grown, setGrown] = useState<Rect | null>(null) // 書き換えている間、文字に合わせた枠
  const editing = edit?.editing === true
  // 書き換えが終わったら、文字に合わせた枠を捨てる（決めたときのほか、やめたときと、書けなくなって捨てたときも）
  useEffect(() => {
    if (!editing) setGrown(null)
  }, [editing])
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
        <TextEditor shape={shape} onGrow={setGrown} onCommit={text => edit.onCommit(text, grown)} />
      ) : (
        View && <View props={shape.props} size={size} id={shape.id} content={{}} zoom={zoom} hasChildren={false} />
      )}
    </SlideItemBox>
  )
}

// 文字枠の文字を書き換えるテキストForm（文字枠と同じ文字の大きさ・そろえ）。外へ出ると決める。やめるのは、テキストForm が名乗る範囲 SLIDE_TEXT_KEY_SCOPE の
// Escape のキーバインド（書き換えを終えて、このテキストForm を外す。外したあとに焦点が外れても決めない）。書いている間に決められなくなったら（ロックなど）、字を捨てて終える。
// 書いている間、枠を文字の幅と高さに寄せる（増えれば広がり、減れば縮む。左上の角は動かない）。
// 始めから折り返している枠（狭くした枠）は幅を変えず、高さだけを文字に寄せる。文字を変えるまでは枠を変えない
function TextEditor({
  shape,
  onGrow,
  onCommit,
}: {
  shape: PlacedShape
  onGrow: (rect: Rect) => void
  onCommit: (text: string) => void
}) {
  const props = shape.props as { text?: string; fontSize?: number; align?: "left" | "center" | "right" }
  const [text, setText] = useState(props.text ?? "")
  const [wraps, setWraps] = useState<boolean | null>(null) // 始めから折り返している枠か（始めに 1 度だけ測る）
  const ended = useRef(false) // 書き換えが外で終わり、このテキストForm を外しているところ
  useLayoutEffect(() => {
    ended.current = false
    return () => {
      ended.current = true
    }
  }, [])
  // 書いている字はこのテキストForm の中にだけあり、書き換えが終わってこれを外せば捨てられるので、捨てる物は無い
  useEndWhenBlocked(true, SLIDE_SET.id, () => {})
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
      data-key-scope={SLIDE_TEXT_KEY_SCOPE.id}
      onBlur={() => {
        if (!ended.current) onCommit(text)
      }}
    />
  )
}
