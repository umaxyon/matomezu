// 領域の右上の隅に置く、最大化と元に戻すのボタン
import { useMessages } from "../../plugin-api/ui"
import { IconButton } from "./IconButton"
import { MaximizeIcon, RestoreIcon } from "./icons"
import { kit } from "./kit"
import styles from "./MaxButton.module.css"

export function MaxButton({ maximized, onToggle }: { maximized: boolean; onToggle: () => void }) {
  const t = useMessages(kit)
  return (
    <IconButton className={styles.corner} label={maximized ? t("Restore") : t("Maximize")} onClick={onToggle}>
      {maximized ? <RestoreIcon /> : <MaximizeIcon />}
    </IconButton>
  )
}
