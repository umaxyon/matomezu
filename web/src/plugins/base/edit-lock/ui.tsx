// その場の編集の編集ロック（ウィジェット edit-lock。根に置き、何も描かない）: ステージがその場の編集をしている間（stage.editing が "none" でない間。
// 書いている・色や種類を選んでいる）、そのステージで開いているページの、選んでいる物に編集ロックを掛ける（その場の編集で何を直しているかは選択で決まる）

import { useShallow } from "zustand/react/shallow"
import { NO_PAGE, shownPageId } from "../../../core/stage"
import { defineWidget } from "../../../ui/layout"
import { useMatomezuState } from "../../../ui/store-context"
import { kit } from "../kit"
import { allStages } from "../utils/stages"
import { useEditLock } from "../utils/useEditLock"

function EditLock() {
  const stages = useMatomezuState(useShallow(s => allStages(s.window)))
  return (
    <>
      {stages.map(s => {
        const page = shownPageId(s.opened)
        // ページを開いていないステージには掛けない
        return page === NO_PAGE ? null : (
          <StageEditLock key={s.id} page={page} ids={s.editing === "none" ? NONE : s.selection} />
        )
      })}
    </>
  )
}

function StageEditLock({ page, ids }: { page: string; ids: readonly string[] }) {
  useEditLock(page, ids)
  return null
}

const NONE: readonly string[] = []

export const EDIT_LOCK = defineWidget({ id: kit.name("edit-lock"), slots: ["root"], view: EditLock })
