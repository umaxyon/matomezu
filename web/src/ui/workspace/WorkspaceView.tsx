// workspace のビュー: ステージの列を並べる。列は、上のツールボックス（出すツールがあるときだけ）・ステージのビュー・下の行の組。
// 列の右上に、そのステージを閉じるボタン（コマンド stage.close を出すとき）を置く。並べ方は workspace の arrangement に従う
import { useShallow } from "zustand/react/shallow"
import { useCommand } from "../commands"
import { StageFooter } from "../footer/StageFooter"
import { useT } from "../i18n"
import { StageView } from "../stage/StageView"
import { useApp } from "../store-context"
import { ToolboxView } from "../toolbox/ToolboxView"
import styles from "./WorkspaceView.module.css"

export function WorkspaceView() {
  const ids = useApp(useShallow(s => s.workspace.stages.map(st => st.id)))
  const direction = useApp(s => s.workspace.arrangement.direction)
  return (
    <main className={`${styles.workspace} ${styles[direction] ?? ""}`}>
      {ids.map(id => (
        <div key={id} className={styles.column}>
          <ToolboxView stage={id} />
          <div className={styles.cell}>
            <StageView id={id} />
          </div>
          <StageFooter stage={id} />
          <CloseButton stage={id} />
        </div>
      ))}
    </main>
  )
}

// コマンド stage.close を出すときだけ描く
function CloseButton({ stage }: { stage: string }) {
  const close = useCommand(stage, "stage.close")
  const t = useT()
  if (!close.shown) return null
  return (
    <button type="button" className={styles.close} aria-label={t(close.title)} onClick={() => close.run()}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
    </button>
  )
}
