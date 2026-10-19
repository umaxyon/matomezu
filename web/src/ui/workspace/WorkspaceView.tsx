// workspace のビュー: ステージの列を並べる。列は、上の行のタブの区画と、その下のステージのビューの組。
// 上の行は列をまたいでつながり、左端の列の区画の頭に leading（道具）を置く。並べ方は workspace の arrangement に従う
import type { ReactNode } from "react"
import { useShallow } from "zustand/react/shallow"
import { StageView } from "../stage/StageView"
import { useApp } from "../store-context"
import { PageTabs } from "../tabs/PageTabs"
import styles from "./WorkspaceView.module.css"

export function WorkspaceView({ leading }: { leading?: ReactNode }) {
  const ids = useApp(useShallow(s => s.workspace.stages.map(st => st.id)))
  const direction = useApp(s => s.workspace.arrangement.direction)
  return (
    <main className={`${styles.workspace} ${styles[direction] ?? ""}`}>
      {ids.map((id, i) => (
        <div key={id} className={styles.column}>
          <div className={styles.bar}>
            {i === 0 && leading}
            <PageTabs stage={id} />
          </div>
          <div className={styles.cell}>
            <StageView id={id} />
          </div>
        </div>
      ))}
    </main>
  )
}
