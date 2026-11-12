// 行の左の、つまんでドラッグする所（useGripDrag の gripProps を付ける）

import styles from "./Grip.module.css"
import { GripIcon } from "./icons"

export function Grip({ onPointerDown }: { onPointerDown: () => void }) {
  return (
    <span className={styles.grip} aria-hidden="true" onPointerDown={onPointerDown}>
      <GripIcon />
    </span>
  )
}
