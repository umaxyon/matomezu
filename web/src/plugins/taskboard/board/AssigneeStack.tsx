// チケットカードの右上の、担当のワークルームの鳥: 2 羽以上なら重ね（前の 1 羽のほかは薄く）、4 羽目からは見せない。乗せると人数を吹き出しで出す
import { useMessages } from "../../../plugin-api/ui"
import { BirdFaceView, Tip } from "../../base/ui"
import { kit } from "../kit"
import styles from "./AssigneeStack.module.css"
import type { WorkroomRecord } from "./shown"

const STACK_SHOWN = 3 // 重ねるときに見せる羽数
const BIRD_SIZE = 18

export function AssigneeStack({ rooms }: { rooms: readonly WorkroomRecord[] }) {
  const t = useMessages(kit)
  if (rooms.length === 0) return null
  const stacked = rooms.length > 1
  const shown = stacked ? rooms.slice(0, STACK_SHOWN) : rooms
  const birds = (
    <span className={styles.birds} data-stacked={stacked}>
      {shown.map((room, i) => (
        <span key={room.id} className={styles.bird} data-back={stacked && i > 0} style={{ zIndex: shown.length - i }}>
          <BirdFaceView bird={room.bird} {...(room.palette ? { palette: room.palette } : {})} size={BIRD_SIZE} />
        </span>
      ))}
    </span>
  )
  return <Tip text={t("{n} assignees", { n: rooms.length })}>{birds}</Tip>
}
