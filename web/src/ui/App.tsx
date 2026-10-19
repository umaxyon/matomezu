// 画面の根: 上にヘッダー、その下にステージを並べた領域
import styles from "./App.module.css"
import { Header } from "./header/Header"
import { WorkspaceView } from "./workspace/WorkspaceView"

export function App() {
  return (
    <div className={styles.app}>
      <Header />
      <WorkspaceView />
    </div>
  )
}
