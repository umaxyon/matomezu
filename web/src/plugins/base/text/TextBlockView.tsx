// 文字の塊のビュー: キャプション（1 行で、収まらなければ … で切る。キャプションも本文も無ければ描かない）、本文が出るなら区切り線と本文を、block.ts の textBlock のとおりに描く。
// 寄せはそれぞれの項目（captionAlign・bodyAlign）。本文は本文の列の中に 1 行ずつ、装飾（太字・文字の色）を付けて描く（ブラウザには折り返させない）。
// grips なら、本文の列の動かせる端（bodySides）につまみを出す。つまみを横にドラッグすると本文の列の幅を描き直し、離したら onBodyWidth に本文の幅を渡す
// （中いっぱいになれば null。変わっていなければ呼ばない）。区切り線の色は lineColor（CSS の値）
import { type CSSProperties, type PointerEvent, useRef, useState } from "react"
import { toPaperDelta } from "../../../core/stage"
import { useStage } from "../../../ui/view-hooks"
import { type BlockProps, bodySides, bodyWidthAfter, textBlock } from "./block"
import { RichText } from "./RichText"
import styles from "./TextBlockView.module.css"

export function TextBlockView({
  props,
  inner,
  least,
  maxH,
  stage,
  grips,
  lineColor,
  onBodyWidth,
}: {
  props: BlockProps
  inner: number // 形の中の幅（枠と左右の余白の内側）
  least: number // 本文の列の一番狭い幅
  maxH: number // 塊に使える高さ
  stage: string
  grips: boolean
  lineColor: string
  onBodyWidth: (width: number | null) => void
}) {
  const at = useStage(stage)
  // 本文の列の端をつかんでいるドラッグ（つかんだ側と、画面の上の始めの x）と、今の本文の幅（動かしていなければ undefined）
  const grab = useRef<{ pointer: number; side: "left" | "right"; start: number } | null>(null)
  const [dragged, setDragged] = useState<number | null | undefined>(undefined)
  const shown: BlockProps = dragged === undefined ? props : { ...props, bodyWidth: dragged ?? undefined }
  const { body, rule, column } = textBlock(shown, inner, least, maxH)
  const hasBody = body.length > 0
  const widthAt = (side: "left" | "right", clientX: number, start: number) =>
    at ? bodyWidthAfter(props, inner, least, side, toPaperDelta(at, { x: clientX - start, y: 0 }).x) : null
  const grip = (side: "left" | "right") => ({
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      grab.current = { pointer: e.pointerId, side, start: e.clientX }
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      const g = grab.current
      if (g?.pointer === e.pointerId) setDragged(widthAt(g.side, e.clientX, g.start))
    },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
      const g = grab.current
      if (g?.pointer !== e.pointerId) return
      grab.current = null
      setDragged(undefined)
      const next = widthAt(g.side, e.clientX, g.start)
      if (next !== (props.bodyWidth ?? null)) onBodyWidth(next)
    },
    onPointerCancel: () => {
      grab.current = null
      setDragged(undefined)
    },
    onDoubleClick: (e: { stopPropagation(): void }) => e.stopPropagation(),
  })
  return (
    <div className={styles.block} style={{ "--block-line": lineColor } as CSSProperties} data-text-block>
      {(props.caption !== "" || hasBody) && (
        <div className={styles.caption} data-align={props.captionAlign}>
          {props.caption}
        </div>
      )}
      {rule && <hr className={styles.rule} style={{ marginLeft: column.x, width: column.w }} />}
      {hasBody && (
        <div className={styles.body} data-align={props.bodyAlign} style={{ marginLeft: column.x, width: column.w }}>
          {body.map((line, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 行は折り返した順の並びで、並べ替えない
            <div key={i} className={styles.line} data-line>
              <RichText line={line} />
            </div>
          ))}
          {grips &&
            bodySides(props).map(side => (
              <div key={side} className={styles.bodyGrip} data-body-grip={side} {...grip(side)} />
            ))}
        </div>
      )}
    </div>
  )
}
