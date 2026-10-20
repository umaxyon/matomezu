// 画面の根: ステージの列と、開いているダイアログを描く
import styles from "./App.module.css"
import { DialogHost } from "./dialog/DialogHost"
import { LangSync } from "./LangSync"
import { SkinStyle } from "./skins/SkinStyle"
import { WorkspaceView } from "./workspace/WorkspaceView"

export function App() {
  return (
    <div className={styles.app}>
      <LangSync />
      <SkinStyle />
      <WorkspaceView />
      <DialogHost />
    </div>
  )
}
