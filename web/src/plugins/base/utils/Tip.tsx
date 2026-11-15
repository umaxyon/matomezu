// 乗せたらすぐ出す、押す物の題の吹き出し（標準の title は少し待たされるので使わない）。見た目は伝言の吹き出しと同じ（スキンの bubble・枠・角丸・影）
// 押す物の下（side が above なら上）に、右端をそろえて出し、押す物の方へ向く尾を付ける。押す物の見た目は変えず、題は読み上げに使わない（押す物の aria-label が答える）
import type { ReactNode } from "react"
import type { CommandId } from "../../../core/catalog"
import { useKeyLabel } from "../../../ui/keys"
import styles from "./Tip.module.css"

// side は吹き出しを出す側（既定は下。画面の下の端に近い物は上に出す）。command を渡すと、そのコマンドに効いているキー（右クリックのメニューと同じ名前）を題の右に添える
export function Tip({
  text,
  side = "below",
  command,
  children,
}: {
  text: string
  side?: "below" | "above"
  command?: CommandId
  children: ReactNode
}) {
  return (
    <span className={styles.tip} data-side={side}>
      {children}
      <span className={styles.bubble} aria-hidden="true">
        <span className={styles.text}>{text}</span>
        {command ? <TipKey command={command} /> : null}
      </span>
    </span>
  )
}

// 題に添えるキー（コマンドに効いているキーが無ければ何も出さない）
function TipKey({ command }: { command: CommandId }) {
  const key = useKeyLabel(command)
  return key ? <kbd className={styles.key}>{key}</kbd> : null
}
