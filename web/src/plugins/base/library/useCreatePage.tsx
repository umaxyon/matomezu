// 書庫でページを作る関数: アクション page-create でフォルダ folder（書庫ホーム・フォルダ・ブック・ブックの外のバインダ）にページを作り、
// 出来た物（バインダを作ったらそのバインダ、ほかはページ）が、書庫の画面で開いているフォルダの直下に在れば、それを選ぶ。断られたら、断りをトーストに出す。
// 作れたかを返す

import { placeOf } from "../../../core/entries"
import type { ArgsOf } from "../../../core/perform"
import { useReadPluginState, useSetPluginState } from "../../../ui/plugin-state-hooks"
import { useCatalog, useReadState } from "../../../ui/store-context"
import { useActions } from "../../../ui/view-hooks"
import { kit } from "../kit"
import type { PAGE_ADD } from "../pages/page-add"
import { refusalMessage } from "../utils"
import { titleTaken } from "../utils/refusal"
import { openedFolderOf } from "./outline"
import { PAGE_CREATE } from "./page-create"
import { LIBRARY_FOLDER, LIBRARY_PICKED } from "./state"
import { NO_DESKS } from "./workdesk-rows"

// replaces は、書庫ホーム・フォルダの直下で同じ名前の物を上書きするとき、消えると利用者が確かめた物の id（page-create の replaces）
export type CreatePageArgs = ArgsOf<typeof PAGE_ADD.id> & { replaces?: string }

export function useCreatePage(): (folder: string, args: CreatePageArgs) => boolean {
  const { perform, showToast } = useActions()
  const catalog = useCatalog().core
  const read = useReadState()
  const readOpened = useReadPluginState(kit, LIBRARY_FOLDER)
  const pick = useSetPluginState(kit, LIBRARY_PICKED)
  return (folder, args) => {
    const done = perform(PAGE_CREATE.id, { ...args, folder })
    if (!done.ok) {
      const refused = kit.message("Could not create")
      showToast(
        titleTaken(done)
          ? { kind: "warn", message: refused, detail: { message: kit.message("The name is taken") } }
          : { kind: "warn", message: refusalMessage(catalog, done, refused) },
      )
      return false
    }
    const made = done.result.binder ?? done.result.page
    const { folders } = read()
    // 作業机の下には作れないので、作業机は渡さない
    if (placeOf(folders, made)?.holder.id === openedFolderOf(folders, readOpened(), NO_DESKS)) pick(made)
    return true
  }
}
