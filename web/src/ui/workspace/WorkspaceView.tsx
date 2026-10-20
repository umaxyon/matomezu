// workspace のビュー: ステージの列を並べる。列は、上のツールボックス（出すツールがあるときだけ）・ステージのビュー・下の行の組。
// ステージが 2 つ以上なら、列の右上にそのステージを閉じるボタンを置く。並べ方は workspace の arrangement に従う
import { useShallow } from "zustand/react/shallow"
import { StageFooter } from "../footer/StageFooter"
import { useT } from "../i18n"
import { StageView } from "../stage/StageView"
import { useActions, useApp } from "../store-context"
import { ToolboxView } from "../toolbox/ToolboxView"
import styles from "./WorkspaceView.module.css"

export function WorkspaceView() {
  const ids = useApp(useShallow(s => s.workspace.stages.map(st => st.id)))
  const direction = useApp(s => s.workspace.arrangement.direction)
  const { closeStage } = useActions()
  const t = useT()
  return (
    <main className={`${styles.workspace} ${styles[direction] ?? ""}`}>
      {ids.map(id => (
        <div key={id} className={styles.column}>
          <ToolboxView stage={id} />
          <div className={styles.cell}>
            <StageView id={id} />
          </div>
          <StageFooter stage={id} />
          {ids.length > 1 && (
            <button
              type="button"
              className={styles.close}
              aria-label={t("ステージを閉じる")}
              onClick={() => closeStage(id)}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          )}
        </div>
      ))}
    </main>
  )
}
