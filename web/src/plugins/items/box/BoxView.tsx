// 箱のアイテムのビュー: 上にキャプション（1 行で、収まらなければ … で切る）、本文が出るなら区切り線と本文。寄せはそれぞれの項目（captionAlign・bodyAlign）。
// 本文は size.ts の boxLayout が折り返して高さに収めた行を、そのまま 1 行ずつ描く（ブラウザには折り返させない）。
// 箱にテーマ（theme）を当てていれば、そのテーマの箱の欄（塗り・線・文字・角の丸み・影・角の折り返し）で描く。表に無いテーマならブックのテーマのまま。
// 色（color）があれば、塗りと文字の欄をその色で上書きする（paint.ts）

import type { CSSProperties } from "react"
import type { ItemProps } from "../../../plugin-api"
import type { ItemViewProps } from "../../../plugin-api/ui"
import { useThemeVars } from "../../base/ui"
import styles from "./BoxView.module.css"
import { BOX } from "./box"
import { paintVars } from "./paint"
import { boxLayout } from "./size"

export function BoxView({ props, size }: ItemViewProps<ItemProps<"@matomezu/box:shape-box">>) {
  const theme = props.theme
  const vars = useThemeVars(theme, BOX.tokens)
  const { body, rule } = boxLayout(props, size)
  const hasBody = body.length > 0
  return (
    <div className={styles.frame} style={vars} data-theme={theme}>
      <div
        className={styles.box}
        style={paintVars(props.color) as CSSProperties}
        data-body={hasBody}
        data-color={props.color}
      >
        {(props.caption !== "" || hasBody) && (
          <div className={styles.caption} data-align={props.captionAlign}>
            {props.caption}
          </div>
        )}
        {rule && <hr className={styles.rule} />}
        {hasBody && (
          <div className={styles.body} data-align={props.bodyAlign}>
            {body.map((line, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 行は折り返した順の並びで、並べ替えない
              <div key={i} className={styles.line} data-line>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
