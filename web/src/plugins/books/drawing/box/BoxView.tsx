// 箱のアイテムのビュー: 上にキャプション（中央寄せ・1 行で、収まらなければ … で切る）、本文が出るなら区切り線と本文（左寄せ）。
// 本文は size.ts の boxLayout が折り返して高さに収めた行を、そのまま 1 行ずつ描く（ブラウザには折り返させない）
import type { Size } from "../../../../core/geom"
import type { ItemProps } from "../../../../core/registry"
import styles from "./BoxView.module.css"
import { boxLayout } from "./size"

export function BoxView({ props, size }: { props: ItemProps<"shape.box">; size: Size }) {
  const { body, rule } = boxLayout(props, size)
  const hasBody = body.length > 0
  return (
    <div className={styles.box} data-body={hasBody}>
      {(props.caption !== "" || hasBody) && <div className={styles.caption}>{props.caption}</div>}
      {rule && <hr className={styles.rule} />}
      {hasBody && (
        <div className={styles.body}>
          {body.map((line, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 行は折り返した順の並びで、並べ替えない
            <div key={i} className={styles.line} data-line>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
