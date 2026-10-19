// 画面の根: ステージの列を並べ、上の行の左端に道具を置く
import styles from "./App.module.css"
import { Toolbar } from "./toolbar/Toolbar"
import { WorkspaceView } from "./workspace/WorkspaceView"

export function App() {
  return (
    <div className={styles.app}>
      <WorkspaceView leading={<Toolbar />} />
    </div>
  )
}
