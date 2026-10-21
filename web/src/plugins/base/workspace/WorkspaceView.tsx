// workspace のビュー（ウィジェット workspace）: ステージの列を並べ、列ごとにステージのスロットを描く。並べ方は workspace の arrangement に従う。
// 列は、上の行（stage.top）・ステージの本体（stage.body）・下の行（stage.bottom）と、右上に浮かぶ角（stage.corner）。何を置くかは配置が決める
import { useShallow } from "zustand/react/shallow"
import { Slot } from "../../../ui/Slot"
import { useApp } from "../../../ui/store-context"
import styles from "./WorkspaceView.module.css"

export function WorkspaceView() {
  const ids = useApp(useShallow(s => s.workspace.stages.map(st => st.id)))
  const direction = useApp(s => s.workspace.arrangement.direction)
  return (
    <main className={`${styles.workspace} ${styles[direction] ?? ""}`}>
      {ids.map(stage => (
        <div key={stage} className={styles.column}>
          <div className={styles.top}>
            <Slot name="stage.top" props={{ stage }} />
          </div>
          <div className={styles.cell}>
            <Slot name="stage.body" props={{ stage }} />
          </div>
          <div className={styles.bottom}>
            <Slot name="stage.bottom" props={{ stage }} />
          </div>
          <div className={styles.corner}>
            <Slot name="stage.corner" props={{ stage }} />
          </div>
        </div>
      ))}
    </main>
  )
}
