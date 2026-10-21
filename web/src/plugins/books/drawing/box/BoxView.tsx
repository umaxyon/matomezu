// 箱のアイテムのビュー: 上にキャプション（中央寄せ・1 行）、本文があれば区切り線と本文（左寄せ）。箱に収まらない分は切る
import type { ItemProps } from "../../../../core/registry"
import styles from "./BoxView.module.css"

export function BoxView({ props }: { props: ItemProps<"shape.box"> }) {
  const body = props.body !== ""
  return (
    <div className={styles.box} data-body={body}>
      {props.caption !== "" && <div className={styles.caption}>{props.caption}</div>}
      {body && props.rule && <hr className={styles.rule} />}
      {body && <div className={styles.body}>{props.body}</div>}
    </div>
  )
}
