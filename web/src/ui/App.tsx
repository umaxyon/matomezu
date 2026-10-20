// 画面の根: ステージの列を並べる
import styles from "./App.module.css"
import { LangSync } from "./LangSync"
import { SkinStyle } from "./skins/SkinStyle"
import { WorkspaceView } from "./workspace/WorkspaceView"

export function App() {
  return (
    <div className={styles.app}>
      <LangSync />
      <SkinStyle />
      <WorkspaceView />
    </div>
  )
}
