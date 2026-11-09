// 画面の根: 言語とスキンを合わせ、キーの受け口を置き、根のスロット（root）を描く。何を置くか（ステージの列・ダイアログの置き場など）は UI マッピングが決める。
// 右クリックでは、どこでもブラウザのメニューを出さない（テキストFormの中は除く）。根のスロットに描かれる物は全部含む
import { stopBrowserMenu } from "./context-menu"
import { KeyListener } from "./keys"
import { LangSync } from "./LangSync"
import { ROOT_SLOT } from "./layout"
import styles from "./Screen.module.css"
import { Slot } from "./Slot"
import { SkinStyle } from "./skins/SkinStyle"

export function Screen() {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: ブラウザのメニューを止めるだけで、操作は持たない
    <div className={styles.screen} onContextMenu={stopBrowserMenu}>
      <LangSync />
      <SkinStyle />
      <KeyListener />
      <Slot name={ROOT_SLOT} props={{}} />
    </div>
  )
}
