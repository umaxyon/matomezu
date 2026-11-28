// 画面の根: 言語とスキンを合わせ、キーの受け口を置き、根のスロット（root）を描く。何を置くか（ステージの列・ダイアログの置き場など）は UI マッピングが決める。
// 右クリックでは、どこでもブラウザのメニューを出さない（テキストFormの中は除く）。外から落としたファイルは、受けるビューの外ではポインタを禁止の印にし、ブラウザに開かせない。
// 根のスロットに描かれる物は全部含む
import type { DragEvent } from "react"
import { stopBrowserMenu } from "./context-menu"
import { KeyListener } from "./keys"
import { LangSync } from "./LangSync"
import { ROOT_SLOT } from "./layout"
import { Slot } from "./Slot"
import { SkinStyle } from "./skins/SkinStyle"
import styles from "./WindowRoot.module.css"

export function WindowRoot() {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: ブラウザのメニューと、ブラウザがファイルを開くのを止めるだけで、操作は持たない
    <div className={styles.screen} onContextMenu={stopBrowserMenu} onDragOver={stopStrayFile} onDrop={stopStrayFile}>
      <LangSync />
      <SkinStyle />
      <KeyListener />
      <Slot name={ROOT_SLOT} props={{}} />
    </div>
  )
}

// 受けるビューが止めずに上がってきた、外からのファイルのドラッグ（受けるビューは、受けるなら上へ伝えない）
function stopStrayFile(e: DragEvent<HTMLElement>) {
  if (!e.dataTransfer.types.includes("Files")) return
  e.preventDefault()
  e.dataTransfer.dropEffect = "none"
}
