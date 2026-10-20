// 箱のアイテムのビュー: 文字を入れた四角
import type { ItemProps } from "../../core/registry"
import styles from "./BoxView.module.css"

export function BoxView({ props }: { props: ItemProps<"shape.box"> }) {
  return <div className={styles.box}>{props.text}</div>
}
