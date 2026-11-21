// 行の頭の絵: 中身の icon（列挙 node-icon の値の id）の絵を、値を足したプラグインが結んだ絵の表（enumValueIcons）から引く。
// 値や絵が無ければ、種類の既定の絵。開け閉めのある絵（フォルダなど）は、開いているときに開いた絵にする。大きさは size（絵は枠いっぱいに描く）
import { useUiCatalog } from "../../../plugin-api/ui"
import type { Kind } from "./node"
import styles from "./node-icon.module.css"
import { DEFAULT_ICON } from "./node-icon-enum"

export function NodeIcon({ kind, icon, open, size }: { kind: Kind; icon?: string; open: boolean; size: number }) {
  const icons = useUiCatalog().enumValueIcons
  const picture = (icon === undefined ? undefined : icons.get(icon)) ?? icons.get(DEFAULT_ICON[kind])
  const shown =
    typeof picture === "object" && picture !== null && "closed" in picture && "open" in picture
      ? open
        ? picture.open
        : picture.closed
      : picture
  return (
    <span className={styles.icon} style={{ width: size, height: size }}>
      {shown}
    </span>
  )
}
