// 箱のアイテムのビュー（箱と内包ボックス）: キャプション・区切り線・本文の塊を、縦の位置（size.ts の vAlignOf）に置く。塊の上にキャプション（1 行で、収まらなければ … で切る）、本文が出るなら区切り線と本文。寄せはそれぞれの項目（captionAlign・bodyAlign）。
// 本文は size.ts の boxLayout が本文の列の幅で折り返して高さに収めた行を、その列の中に 1 行ずつ、装飾（太字・文字の色）を付けて描く（ブラウザには折り返させない）。
// 箱を選んでいる間（紙をずらす道具の間は除く）は、本文の列の動かせる端（size.ts の bodySides）につまみを出す。つまみを横にドラッグすると、本文の列の幅を描き直し、
// 離したら本文の幅（bodyWidth）をアクション item-update で書く（箱の中いっぱいになれば消す）。書き換えが止められていれば、つまみを出さない。
// 箱にテーマ（theme）を当てていれば、そのテーマの箱のテーマキー（塗り・線・文字・角の丸み・影・角の折り返し）で描く。表に無いテーマならブックのテーマのまま。
// 色（color）があれば、塗りと文字のテーマキーをその色で上書きする（paint.ts）

import { type CSSProperties, type PointerEvent, useRef, useState } from "react"
import { type ItemProps, toPaperDelta } from "../../../plugin-api"
import { type ItemViewProps, useAllowed, usePerform, useStage } from "../../../plugin-api/ui"
import { RichText, useThemeVars } from "../../base/ui"
import styles from "./BoxView.module.css"
import { type BOX, BOX_TOKENS } from "./box"
import { paintVars } from "./paint"
import { bodySides, bodyWidthAfter, boxLayout, vAlignOf } from "./size"

type BoxProps = ItemProps<typeof BOX.id>

export function BoxView({ props, size, hasChildren, id, stage }: ItemViewProps<BoxProps>) {
  const theme = props.theme
  const vars = useThemeVars(theme, BOX_TOKENS)
  const at = useStage(stage)
  const page = at?.opened?.page ?? undefined
  const perform = usePerform(stage)
  const allowed = useAllowed(stage, "@matomezu/paper:item-update", { page, items: [id] }).ok
  // 本文の列の端をつかんでいるドラッグ（つかんだ側と、画面の上の始めの x）と、今の本文の幅（動かしていなければ undefined）
  const grab = useRef<{ pointer: number; side: "left" | "right"; start: number } | null>(null)
  const [dragged, setDragged] = useState<number | null | undefined>(undefined)
  const shown: BoxProps = dragged === undefined ? props : { ...props, bodyWidth: dragged ?? undefined }
  const { body, rule, column } = boxLayout(shown, size)
  const hasBody = body.length > 0
  const grips = hasBody && allowed && at !== null && !at.pans && at.selection.includes(id)
  const widthAt = (side: "left" | "right", clientX: number, start: number) =>
    at ? bodyWidthAfter(props, size.w, side, toPaperDelta(at, { x: clientX - start, y: 0 }).x) : null
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
      if (page && next !== (props.bodyWidth ?? null))
        perform("@matomezu/paper:item-update", { page, item: id, props: { bodyWidth: next } })
    },
    onPointerCancel: () => {
      grab.current = null
      setDragged(undefined)
    },
    onDoubleClick: (e: { stopPropagation(): void }) => e.stopPropagation(),
  })
  return (
    <div className={styles.frame} style={vars} data-theme={theme}>
      <div
        className={styles.box}
        style={paintVars(props.color) as CSSProperties}
        data-valign={vAlignOf(props, hasChildren)}
        data-color={props.color}
      >
        {(props.caption !== "" || hasBody) && (
          <div className={styles.caption} data-align={props.captionAlign}>
            {props.caption}
          </div>
        )}
        {rule && <hr className={styles.rule} />}
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
    </div>
  )
}
