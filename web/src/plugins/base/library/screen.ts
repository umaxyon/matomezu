// 書庫のスクリーン（書庫の画面だけを見せる、ステージを並べないスクリーン）と、それを窓いっぱいに出すコマンド「書庫を開く」。
// 開く先は、置かれた所で決める（渡す値は無い）: ブックスクリーンと上下に並んでいれば、そのブックスクリーンの空のステージ（emptyStageAbove）、並んでいなければ新しいブックスクリーン
import { z } from "zod"
import { screensOf, storeActionsOf } from "../../../store/commands/def"
import { NO_STAGE } from "../../../store/dialogs"
import { kit } from "../kit"
import { LIBRARY_APPEARANCE } from "./state"
import { ONE_SCREEN } from "../window"
import { splitOf } from "../window/split"

export const LIBRARY_SCREEN = kit.defineScreen({
  id: "library-screen",
  title: "Library",
  aiDescription:
    "The library alone: the folder tree and the contents of the open folder. Below a book screen whose stages are split, a book picked there opens in the empty stage; over the whole window, it opens in a new book screen.",
  props: z.strictObject({}),
  libraryAppearances: [LIBRARY_APPEARANCE.id],
  maxOpen: 1,
})

// 書庫のスクリーンを窓いっぱいに出す（開いていれば、それを前に出す）
export const LIBRARY_OPEN = kit.defineScreenCommand({
  id: "library-open",
  title: "Open library",
  run: (ctx, a) => {
    const store = storeActionsOf(a)
    const opened = screensOf(ctx).find(s => s.def === LIBRARY_SCREEN.id)
    store.setScreenArrangement(ONE_SCREEN.id)
    if (opened) store.makeScreenCurrent(opened.id)
    else store.openScreenId(LIBRARY_SCREEN.id, {})
  },
  when: () => true,
})

// 書庫のスクリーン screen と上下に並んでいるブックスクリーンの、何も開いていないステージ（ステージを分けて足した物）。並んでいない・空のステージが無ければ NO_STAGE。
// screens は開いているスクリーン（何も開いていないステージの id の vacant を持つ）、value はスクリーンアレンジメントの値
export function emptyStageAbove(
  screens: readonly { id: string; vacant: readonly string[] }[],
  value: unknown,
  screen: string,
): string {
  const rows = splitOf(screens, value)
  if (!rows.includes(screen)) return NO_STAGE
  for (const id of rows) {
    const vacant = screens.find(s => s.id === id)?.vacant[0]
    if (vacant !== undefined) return vacant
  }
  return NO_STAGE
}
