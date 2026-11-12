// 領域の右上の隅に置く、最大化と元に戻すのボタン
import { useMessages } from "../../../ui/i18n"
import { kit } from "../kit"
import { IconButton } from "./IconButton"
import styles from "./MaxButton.module.css"

const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    {children}
  </svg>
)

const MaximizeIcon = () => (
  <Svg>
    <rect x="5" y="5" width="14" height="14" rx="1.5" />
  </Svg>
)

const RestoreIcon = () => (
  <Svg>
    <rect x="4.5" y="8.5" width="11" height="11" rx="1.5" />
    <path d="M8.5 8.5v-3a1.5 1.5 0 0 1 1.5-1.5h8a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-3" />
  </Svg>
)

export function MaxButton({ maximized, onToggle }: { maximized: boolean; onToggle: () => void }) {
  const t = useMessages(kit)
  return (
    <IconButton className={styles.corner} label={maximized ? t("Restore area") : t("Maximize area")} onClick={onToggle}>
      {maximized ? <RestoreIcon /> : <MaximizeIcon />}
    </IconButton>
  )
}
