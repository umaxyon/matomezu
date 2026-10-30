// 箱のアイテムのビュー（箱と内包ボックス）: キャプション・区切り線・本文の塊を、縦の位置（size.ts の vAlignOf）に置く。塊の上にキャプション（1 行で、収まらなければ … で切る）、本文が出るなら区切り線と本文。寄せはそれぞれの項目（captionAlign・bodyAlign）。
// 塊は base の TextBlockView で、枠と余白の内側に描く（本文の列の幅で折り返して高さに収めた行。区切り線も本文の列の幅に引く）。
// 箱を選んでいる間（紙をずらす道具の間は除く）は、本文の列の動かせる端につまみを出し、離したら本文の幅（bodyWidth）をアクション item-update で書く
// （箱の中いっぱいになれば消す）。書き換えが止められていれば、つまみを出さない。
// 箱にテーマ（theme）を当てていれば、そのテーマの箱のテーマキー（塗り・線・文字・角の丸み・影・角の折り返し）で描く。表に無いテーマならブックのテーマのまま。
// 色（color）があれば、塗りと文字のテーマキーをその色で上書きする（paint.ts）

import type { CSSProperties } from "react"
import type { ItemProps } from "../../../plugin-api"
import { type ItemViewProps, useAllowed, usePerform, useStage } from "../../../plugin-api/ui"
import { TextBlockView, useThemeVars } from "../../base/ui"
import styles from "./BoxView.module.css"
import { type BOX, BOX_TOKENS } from "./box"
import { paintVars } from "./paint"
import { BODY_LEAST, BOX_LOOK, innerWidth, vAlignOf } from "./size"

type BoxProps = ItemProps<typeof BOX.id>

export function BoxView({ props, size, hasChildren, id, stage }: ItemViewProps<BoxProps>) {
  const theme = props.theme
  const vars = useThemeVars(theme, BOX_TOKENS)
  const at = useStage(stage)
  const page = at?.opened?.page ?? undefined
  const perform = usePerform(stage)
  const allowed = useAllowed(stage, "@matomezu/paper:item-update", { page, items: [id] }).ok
  const grips = allowed && at !== null && !at.pans && at.selection.includes(id)
  return (
    <div className={styles.frame} style={vars} data-theme={theme}>
      <div
        className={styles.box}
        style={paintVars(props.color) as CSSProperties}
        data-valign={vAlignOf(props, hasChildren)}
        data-color={props.color}
      >
        <TextBlockView
          props={props}
          inner={innerWidth(size.w)}
          least={BODY_LEAST}
          maxH={size.h - 2 * (BOX_LOOK.border + BOX_LOOK.padY)}
          stage={stage}
          grips={grips}
          lineColor="var(--box-line)"
          onBodyWidth={bodyWidth => {
            if (page) perform("@matomezu/paper:item-update", { page, item: id, props: { bodyWidth } })
          }}
        />
      </div>
    </div>
  )
}
