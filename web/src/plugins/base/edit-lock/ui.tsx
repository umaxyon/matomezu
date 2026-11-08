// その場の編集の編集ロック（ウィジェット edit-lock。根に置き、何も描かない）: ステージがその場の編集をしている間（stage.editing が false でない間。
// 書いている・色や種類を選んでいる）、そのステージのブックの、選んでいる物に編集ロックを掛ける（その場の編集で何を直しているかは選択で決まる）

import { screenOf } from "../../../core/window"
import { defineWidget } from "../../../ui/layout"
import { useMatomezuState } from "../../../ui/store-context"
import { kit } from "../kit"
import { useEditLock } from "../utils/useEditLock"

function EditLock() {
  const stages = useMatomezuState(s => screenOf(s.window).stages)
  return (
    <>
      {stages.map(s => (
        <StageEditLock key={s.id} book={s.opened?.book ?? null} ids={s.editing === false ? NONE : s.selection} />
      ))}
    </>
  )
}

function StageEditLock({ book, ids }: { book: string | null; ids: readonly string[] }) {
  useEditLock(book, ids)
  return null
}

const NONE: readonly string[] = []

export const EDIT_LOCK = defineWidget({ id: kit.name("edit-lock"), slots: ["root"], view: EditLock })
