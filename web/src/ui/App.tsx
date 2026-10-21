// 画面の根: 言語とスキンを合わせ、根のスロット（app）を描く。何を置くか（ステージの列・ダイアログの置き場など）は配置が決める
import styles from "./App.module.css"
import { LangSync } from "./LangSync"
import { ROOT_SLOT } from "./layout"
import { Slot } from "./Slot"
import { SkinStyle } from "./skins/SkinStyle"

export function App() {
  return (
    <div className={styles.app}>
      <LangSync />
      <SkinStyle />
      <Slot name={ROOT_SLOT} props={{}} />
    </div>
  )
}
