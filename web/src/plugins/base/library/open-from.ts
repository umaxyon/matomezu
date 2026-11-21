// 書庫の画面から、ブック・ページ・バインダ・ブックの外のページを窓に出す（開く先は、呼ばれた書庫の置かれた所で決める）。
// 呼ばれたのが、ブックスクリーンと上下に並んだ書庫のスクリーンなら、そのブックスクリーンに開く（「画面を分割」で足した空のステージ、無ければカレントのステージの開いている物を替える）。
// ほかは新しいブックスクリーン（開き分けは store の openToStage）。
// 書庫のスクリーンから開いたら、書庫のスクリーンは閉じる（コントロールセンターの書庫の画面から開いたときは、そのまま）

import type { OpenTo } from "../../../store/actions"
import {
  arrangementValueIn,
  type CommandActions,
  calledScreenIdOf,
  type ScreenCommandContext,
  screensOf,
  storeActionsOf,
} from "../../../store/commands/def"
import { NO_STAGE } from "../../../store/dialogs"
import { LIBRARY_SCREEN, leaveLibrary, stageBeside } from "./screen"

export function openFromLibrary(ctx: ScreenCommandContext, a: CommandActions, to: OpenTo): void {
  const store = storeActionsOf(a)
  const here = calledScreenIdOf(ctx)
  const screens = screensOf(ctx)
  const value = arrangementValueIn(ctx)
  const beside = stageBeside(screens, value, here)
  const stage = store.openToStage(to, beside)
  if (stage === NO_STAGE || ctx.screen.def !== LIBRARY_SCREEN.id) return
  // 開いたステージは残す
  leaveLibrary(store, screens, value, here)
  store.showStage(stage)
}
