// 作業しているワークルームの鳥（ウィジェット worker-birds）: ステージの下の行のブックの名前の枠の中、名前の前に、開いているワーカーブックを今の作業にしているワークルームの
// 鳥の顔を並べる（workerBirdsOf）。乗せるとワークルームの名前を出す。押すと書庫でそのブックの置き場所を開き、そのブックを選ぶ（コマンド library-place-open。
// 作業机に映っていなければ、押せない顔だけを出す）。ワーカーブックでないブック・ブックの外の物には出さない
import { useMemo } from "react"
import { NO_BOOK } from "../../../store/commands/def"
import { useCommand } from "../../../ui/commands"
import { defineWidget } from "../../../ui/layout"
import { useMatomezuState } from "../../../ui/store-context"
import { useBook } from "../../../ui/view-hooks"
import { BOOK_NAME_HEAD } from "../book-name/head"
import { kit } from "../kit"
import { useWorkdesks } from "../library/hooks"
import { LIBRARY_PLACE_OPEN } from "../library/screen"
import { BirdFaceView } from "./BirdFaceView"
import { useWorkrooms } from "./hooks"
import styles from "./WorkerBirds.module.css"
import { type WorkerBird, workerBirdsOf } from "./workdesks"

const FACE = 16

// ブック book（無ければ空）を今の作業にしているワークルームの鳥
export function useWorkerBirds(book: string | undefined): readonly WorkerBird[] {
  const desks = useWorkdesks()
  const rooms = useWorkrooms()
  const folders = useMatomezuState(s => s.folders)
  return useMemo(
    () => (book === undefined ? [] : workerBirdsOf(folders, book, desks, rooms)),
    [folders, book, desks, rooms],
  )
}

function WorkerBirds() {
  const book = useBook()
  const id = book === NO_BOOK ? undefined : book.id
  const birds = useWorkerBirds(id)
  const open = useCommand(LIBRARY_PLACE_OPEN.id, id === undefined ? undefined : { entry: id })
  if (id === undefined || birds.length === 0) return null
  const names = birds.map(b => b.title).join(", ")
  const faces = birds.map(b => <BirdFaceView key={b.room} bird={b.bird} palette={b.palette} size={FACE} />)
  if (!open.shown)
    return (
      <span className={styles.birds} title={names} role="img" aria-label={names} data-worker-birds>
        {faces}
      </span>
    )
  return (
    <button
      type="button"
      className={`${styles.birds} ${styles.button}`}
      title={names}
      aria-label={names}
      disabled={!open.enabled}
      onClick={() => open.run({ entry: id })}
      data-worker-birds
    >
      {faces}
    </button>
  )
}

export const WORKER_BIRDS = defineWidget({
  id: kit.name("worker-birds"),
  slots: [BOOK_NAME_HEAD],
  view: WorkerBirds,
})
