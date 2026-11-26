// チケットカードの右上の、担当のワークルームの鳥: このチケットをカレントチケットにしているワークルーム（working）の鳥ははっきり、担当に入っているだけの鳥は薄く。
// はっきりした鳥を前に並べ、2 羽以上なら重ね、4 羽目からは見せない。乗せると担当のワークルームの名前を鳥と同じ順に 1 行ずつ吹き出しで出す
import { BirdFaceView, Tip } from "../../base/ui"
import styles from "./AssigneeStack.module.css"
import type { WorkroomRecord } from "./shown"

const STACK_SHOWN = 3 // 重ねるときに見せる羽数
const BIRD_SIZE = 18

export function AssigneeStack({ rooms, working }: { rooms: readonly WorkroomRecord[]; working: ReadonlySet<string> }) {
  if (rooms.length === 0) return null
  const stacked = rooms.length > 1
  const ordered = [...rooms.filter(r => working.has(r.id)), ...rooms.filter(r => !working.has(r.id))]
  const shown = stacked ? ordered.slice(0, STACK_SHOWN) : ordered
  const birds = (
    <span className={styles.birds} data-stacked={stacked}>
      {shown.map((room, i) => (
        <span
          key={room.id}
          className={styles.bird}
          data-assigned-only={!working.has(room.id)}
          style={{ zIndex: shown.length - i }}
        >
          <BirdFaceView bird={room.bird} {...(room.palette ? { palette: room.palette } : {})} size={BIRD_SIZE} />
        </span>
      ))}
    </span>
  )
  return <Tip text={ordered.map(r => r.name).join("\n")}>{birds}</Tip>
}
