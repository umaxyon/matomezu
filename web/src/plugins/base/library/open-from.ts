// 書庫の画面から、ブック・ページ・バインダを窓に出す（開く先は、呼ばれた書庫の置かれた所で決める）。
// 呼ばれたのが、ブックスクリーンと上下に並んだ書庫のスクリーン（「画面を分割」で下に出した物）なら、そのブックスクリーンの何も開いていないステージに開く。ほかは新しいブックスクリーン（showBookStage）。
// 書庫のスクリーンから開いたら、書庫のスクリーンは閉じる（コントロールセンターの書庫の画面から開いたときは、そのまま）
import {
  arrangementValueIn,
  type CommandActions,
  calledScreenIdOf,
  type ScreenCommandContext,
  screensOf,
  storeActionsOf,
} from "../../../store/commands/def"
import { NO_STAGE } from "../../../store/dialogs"
import { closeLibrary, LIBRARY_SCREEN, vacantStageBeside } from "./screen"

export interface OpenTo {
  book: string
  page?: string
  binder?: string
}

export function openFromLibrary(ctx: ScreenCommandContext, a: CommandActions, to: OpenTo): void {
  const store = storeActionsOf(a)
  const here = calledScreenIdOf(ctx)
  const screens = screensOf(ctx)
  const value = arrangementValueIn(ctx)
  const vacant = vacantStageBeside(screens, value, here)
  const stage = vacant === NO_STAGE ? store.showBookStage(to.book, to.page) : vacant
  if (stage === NO_STAGE) return
  if (vacant !== NO_STAGE) {
    store.openBook(stage, to.book)
    if (to.page !== undefined) store.openPage(stage, to.page)
  }
  if (to.binder !== undefined) store.openBinder(stage, to.binder)
  if (ctx.screen.def !== LIBRARY_SCREEN.id) return
  // 開いたステージはもう空でないので、閉じる物に数えない
  closeLibrary(
    store,
    screens.map(s => ({ ...s, vacant: [] })),
    value,
    here,
  )
  store.showStage(stage)
}
