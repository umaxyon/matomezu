// workspace のビュー: ステージのビューを並べる領域。並べ方は workspace の arrangement に従い、ステージには枠だけを渡す
import { useShallow } from "zustand/react/shallow"
import { StageView } from "../stage/StageView"
import { useApp } from "../store-context"
import styles from "./WorkspaceView.module.css"

export function WorkspaceView() {
  const ids = useApp(useShallow(s => s.workspace.stages.map(st => st.id)))
  const direction = useApp(s => s.workspace.arrangement.direction)
  return (
    <main className={`${styles.workspace} ${styles[direction] ?? ""}`}>
      {ids.map(id => (
        <div key={id} className={styles.cell}>
          <StageView id={id} />
        </div>
      ))}
    </main>
  )
}
