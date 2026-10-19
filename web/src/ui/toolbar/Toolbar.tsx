// 道具: 画面全体にかける操作（画面を分ける）
import { useActions, useApp } from "../store-context"
import styles from "./Toolbar.module.css"

export function Toolbar() {
  const isSplit = useApp(s => s.workspace.stages.length > 1)
  const { split, unsplit } = useActions()
  return (
    <div className={styles.tools}>
      <button
        type="button"
        className={styles.iconButton}
        aria-label="画面を分割"
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
