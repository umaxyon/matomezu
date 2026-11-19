// 書庫の画面から、ブック・ページ・バインダを窓に出す（開く先は、呼ばれた書庫の置かれた所で決める）。
// 呼ばれたのが、ブックスクリーンと上下に並んだ書庫のスクリーン（「画面を分割」で下に出した物）なら、そのブックスクリーンの何も開いていないステージに開き、
// 書庫のスクリーンを閉じてブックスクリーンだけに戻す。ほかは新しいブックスクリーン（showBookStage）
import {
  arrangementValueIn,
  type CommandActions,
  calledScreenIdOf,
  type ScreenCommandContext,
  screensOf,
  storeActionsOf,
} from "../../../store/commands/def"
import { NO_STAGE } from "../../../store/dialogs"
import { ONE_SCREEN } from "../window"
import { emptyStageAbove } from "./screen"

export interface OpenTo {
  book: string
  page?: string
  binder?: string
}

export function openFromLibrary(ctx: ScreenCommandContext, a: CommandActions, to: OpenTo): void {
  const store = storeActionsOf(a)
  const here = calledScreenIdOf(ctx)
  const stage = emptyStageAbove(screensOf(ctx), arrangementValueIn(ctx), here)
  if (stage === NO_STAGE) {
    const shown = store.showBookStage(to.book, to.page)
    if (shown !== NO_STAGE && to.binder !== undefined) store.openBinder(shown, to.binder)
    return
  }
  store.openBook(stage, to.book)
  if (to.page !== undefined) store.openPage(stage, to.page)
  if (to.binder !== undefined) store.openBinder(stage, to.binder)
  store.closeScreen(here)
  store.setScreenArrangement(ONE_SCREEN.id)
  store.showStage(stage)
}
