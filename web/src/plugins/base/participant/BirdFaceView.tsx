// 鳥の顔の丸い絵（配色 palette を塗ったもの。eyes が closed なら目を閉じた絵。塗り終わるまでは同じ大きさの丸だけ）
import type { Bird } from "../birds"
import type { FaceEyes } from "../birds/paint"
import { useBirdFace } from "../birds/use-bird-sheet"
import styles from "./Participant.module.css"

export function BirdFaceView({
  bird,
  palette,
  size,
  eyes = "open",
}: {
  bird: Bird
  palette?: string
  size: number
  eyes?: FaceEyes
}) {
  const url = useBirdFace(bird, palette, eyes)
  return (
    <span className={styles.face} style={{ width: size, height: size }} aria-hidden>
      {url && <img src={url} alt="" width={size} height={size} />}
    </span>
  )
}
