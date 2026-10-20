// 道具: 画面全体にかける操作（マスターを開く・画面を分ける）
import { useT } from "../i18n"
import { useActions, useApp } from "../store-context"
import styles from "./Toolbar.module.css"

export function Toolbar() {
  const isSplit = useApp(s => s.workspace.stages.length > 1)
  const onMaster = useApp(s => s.workspace.stages.find(st => st.id === s.workspace.current)?.opened?.type === "master")
  const { split, unsplit, openMaster } = useActions()
  const t = useT()
  return (
    <div className={styles.tools}>
      <button
        type="button"
        className={styles.iconButton}
        aria-label={t("マスター")}
        aria-pressed={onMaster}
        onClick={openMaster}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 11 12 4l8 7" />
          <path d="M6 9.5V20h12V9.5" />
        </svg>
      </button>
      <button
        type="button"
        className={styles.iconButton}
        aria-label={t("画面を分割")}
        aria-pressed={isSplit}
        onClick={isSplit ? unsplit : split}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M12 5v14" />
        </svg>
      </button>
    </div>
  )
}
