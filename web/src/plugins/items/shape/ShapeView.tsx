// 形のアイテムのビュー: 形の輪郭（outline.ts）を SVG で描き、キャプションを 1 行（収まらなければ … で切る）で真ん中に置く。
// 輪郭とキャプションの空きは size.ts の shapeLayout が決め、ビューはそのとおりに描く。寄せは captionAlign。
// 形にテーマ（theme）を当てていれば、そのテーマの形のテーマキーで描く。色（color）があれば、塗りと文字のテーマキーをその色で上書きする（paint.ts）
import type { CSSProperties } from "react"
import type { ItemProps } from "../../../plugin-api"
import type { ItemViewProps } from "../../../plugin-api/ui"
import { useThemeVars } from "../../base/ui"
import type { Outline, ShapeKind } from "./outline"
import { paintVars } from "./paint"
import styles from "./ShapeView.module.css"
import { type ROUNDED, SHAPE_TOKENS } from "./shapes"
import { shapeLayout } from "./size"

type ShapeProps = ItemProps<typeof ROUNDED.item.id>

// 輪郭の図形（線の太さの半分だけ内側に描き、四角からはみ出さない）
export function OutlineShape({ outline: o }: { outline: Outline }) {
  return (
    <g transform="translate(1 1)">
      {o.kind === "polygon" ? (
        <polygon points={o.points} />
      ) : o.kind === "rect" ? (
        <rect width={o.w} height={o.h} rx={o.rx} />
      ) : (
        <ellipse cx={o.w / 2} cy={o.h / 2} rx={o.w / 2} ry={o.h / 2} />
      )}
    </g>
  )
}

export function shapeView(kind: ShapeKind) {
  return function ShapeView({ props, size }: ItemViewProps<ShapeProps>) {
    const vars = useThemeVars(props.theme, SHAPE_TOKENS)
    const { outline, inset } = shapeLayout(kind, size)
    return (
      <div className={styles.frame} style={vars} data-theme={props.theme} data-shape-kind={kind}>
        <div className={styles.shape} style={paintVars(props.color) as CSSProperties} data-color={props.color}>
          <svg className={styles.outline} width={size.w} height={size.h} aria-hidden="true">
            <OutlineShape outline={outline} />
          </svg>
          {props.caption !== "" && (
            <div className={styles.caption} data-align={props.captionAlign} style={{ left: inset, right: inset }}>
              {props.caption}
            </div>
          )}
        </div>
      </div>
    )
  }
}
