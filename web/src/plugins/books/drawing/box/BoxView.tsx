// 箱のアイテムのビュー: 上にキャプション（1 行で、収まらなければ … で切る）、本文が出るなら区切り線と本文。寄せはそれぞれの項目（captionAlign・bodyAlign）。
// 本文は size.ts の boxLayout が折り返して高さに収めた行を、そのまま 1 行ずつ描く（ブラウザには折り返させない）。
// 箱にテーマ（theme）を当てていれば、そのテーマの箱の欄（塗り・線・文字・角の丸み・影・角の折り返し）で描く。表に無いテーマならブックのテーマのまま
import { useMemo } from "react"
import type { Size } from "../../../../core/geom"
import type { ItemProps } from "../../../../core/registry"
import { resolveTokens } from "../../../../core/theme"
import { useRegistry } from "../../../../ui/store-context"
import { themeVars } from "../../../../ui/theme-vars"
import { BOX } from "."
import styles from "./BoxView.module.css"
import { boxLayout } from "./size"

export function BoxView({ props, size }: { props: ItemProps<"shape.box">; size: Size }) {
  const registry = useRegistry()
  const theme = props.theme
  const vars = useMemo(
    () => (theme && registry.themes.has(theme) ? themeVars(resolveTokens(registry, theme, BOX.tokens)) : undefined),
    [registry, theme],
  )
  const { body, rule } = boxLayout(props, size)
  const hasBody = body.length > 0
  return (
    <div className={styles.frame} style={vars} data-theme={theme}>
      <div className={styles.box} data-body={hasBody}>
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
