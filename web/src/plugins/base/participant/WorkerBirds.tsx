// 作業しているワークルームの鳥（ウィジェット worker-birds）: ステージの下の行のブックの名前の枠の中、名前の前に、開いているワーカーブックを今の作業にしているワークルームの
// 鳥の顔を並べる（workerBirdsOf）。乗せるとワークルームの名前を出す。ワーカーブックでないブック・ブックの外の物には出さない
import { useMemo } from "react"
import { NO_BOOK } from "../../../store/commands/def"
import { defineWidget } from "../../../ui/layout"
import { useMatomezuState } from "../../../ui/store-context"
import { useBook } from "../../../ui/view-hooks"
import { BOOK_NAME_HEAD } from "../book-name/head"
import { kit } from "../kit"
import { useWorkdesks } from "../library/hooks"
import { BirdFaceView } from "./BirdFaceView"
import { useWorkrooms } from "./hooks"
import styles from "./WorkerBirds.module.css"
import { workerBirdsOf } from "./workdesks"

const FACE = 16

function WorkerBirds() {
  const book = useBook()
  const desks = useWorkdesks()
  const rooms = useWorkrooms()
  const folders = useMatomezuState(s => s.folders)
  const id = book === NO_BOOK ? undefined : book.id
  const birds = useMemo(
    () => (id === undefined ? [] : workerBirdsOf(folders, id, desks, rooms)),
    [folders, id, desks, rooms],
  )
  if (birds.length === 0) return null
  const names = birds.map(b => b.title).join(", ")
  return (
    <span className={styles.birds} title={names} role="img" aria-label={names} data-worker-birds>
      {birds.map(b => (
        <BirdFaceView key={b.room} bird={b.bird} palette={b.palette} size={FACE} />
      ))}
    </span>
  )
}

export const WORKER_BIRDS = defineWidget({
  id: kit.name("worker-birds"),
  slots: [BOOK_NAME_HEAD],
  view: WorkerBirds,
})
