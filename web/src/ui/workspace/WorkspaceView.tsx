// workspace のビュー: ステージの列を並べる。列は、上の行のタブの区画と、その下のステージのビューの組。
// 上の行は列をまたいでつながり、左端の列の区画の頭に leading（道具）を置く。ステージが 2 つ以上なら、区画の右端にそのステージを閉じるボタンを置く。並べ方は workspace の arrangement に従う
import type { ReactNode } from "react"
import { useShallow } from "zustand/react/shallow"
import { useT } from "../i18n"
import { StageView } from "../stage/StageView"
import { useActions, useApp } from "../store-context"
import { PageTabs } from "../tabs/PageTabs"
import styles from "./WorkspaceView.module.css"

export function WorkspaceView({ leading }: { leading?: ReactNode }) {
  const ids = useApp(useShallow(s => s.workspace.stages.map(st => st.id)))
  const direction = useApp(s => s.workspace.arrangement.direction)
  const { closeStage } = useActions()
  const t = useT()
  return (
    <main className={`${styles.workspace} ${styles[direction] ?? ""}`}>
      {ids.map((id, i) => (
        <div key={id} className={styles.column}>
          <div className={styles.bar}>
            {i === 0 && leading}
            <PageTabs stage={id} />
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
          <div className={styles.cell}>
            <StageView id={id} />
          </div>
        </div>
      ))}
    </main>
  )
}
