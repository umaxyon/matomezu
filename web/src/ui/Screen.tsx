// 画面の根: 言語とスキンを合わせ、キーの受け口を置き、根のスロット（root）を描く。何を置くか（ステージの列・ダイアログの置き場など）は配置が決める

import { KeyListener } from "./keys"
import { LangSync } from "./LangSync"
import { ROOT_SLOT } from "./layout"
import styles from "./Screen.module.css"
import { Slot } from "./Slot"
import { SkinStyle } from "./skins/SkinStyle"

export function Screen() {
  return (
    <div className={styles.screen}>
      <LangSync />
      <SkinStyle />
      <KeyListener />
      <Slot name={ROOT_SLOT} props={{}} />
    </div>
  )
}
