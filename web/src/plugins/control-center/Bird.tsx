// ワークルームの鳥（鳥の顔）。管理者の鳥は頭に金の王冠を重ねる。準備中の参加者の鳥は薄くする。空室は中が空の点線の丸
import type { WorkroomRow } from "../base"
import { AdminCrown, BirdFaceView } from "../base/ui"
import styles from "./Bird.module.css"

export const BIRD_SIZE = 22

export function Bird({ row, size = BIRD_SIZE }: { row: WorkroomRow; size?: number }) {
  if (row.state === "empty")
    return <span className={styles.empty} style={{ width: size, height: size }} aria-hidden="true" />
  return (
    <span className={styles.wrap} data-preparing={row.state === "preparing"}>
      <AdminCrown admin={row.admin} size={size}>
        <BirdFaceView bird={row.room.bird} {...(row.room.palette ? { palette: row.room.palette } : {})} size={size} />
      </AdminCrown>
    </span>
  )
}
