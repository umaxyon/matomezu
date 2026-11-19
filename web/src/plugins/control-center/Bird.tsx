// ワークルームの鳥（鳥の顔）。管理者の鳥は頭に金の王冠を重ねる。準備中の参加者の鳥は薄くする。空室は中が空の点線の丸
import type { WorkroomRow } from "../base"
import { BirdFaceView } from "../base/ui"
import styles from "./Bird.module.css"
import { CrownIcon } from "./icons"

export const BIRD_SIZE = 22
const CROWN_RATIO = 0.7

export function Bird({ row, size = BIRD_SIZE }: { row: WorkroomRow; size?: number }) {
  if (row.state === "empty")
    return <span className={styles.empty} style={{ width: size, height: size }} aria-hidden="true" />
  return (
    <span className={styles.wrap} data-preparing={row.state === "preparing"} style={{ width: size, height: size }}>
      <BirdFaceView bird={row.room.bird} {...(row.room.palette ? { palette: row.room.palette } : {})} size={size} />
      {row.admin ? (
        <span className={styles.crownBox} style={{ width: size * CROWN_RATIO }}>
          <CrownIcon width={size * CROWN_RATIO} />
        </span>
      ) : null}
    </span>
  )
}
