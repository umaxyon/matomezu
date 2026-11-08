// 鳥の顔の丸い絵（配色 palette を塗ったもの。塗り終わるまでは同じ大きさの丸だけ）
import type { Bird } from "../birds"
import { useBirdFace } from "../birds/use-bird-sheet"
import styles from "./Participant.module.css"

export function BirdFaceView({ bird, palette, size }: { bird: Bird; palette?: string; size: number }) {
  const url = useBirdFace(bird, palette)
  return (
    <span className={styles.face} style={{ width: size, height: size }} aria-hidden>
      {url && <img src={url} alt="" width={size} height={size} />}
    </span>
  )
}
