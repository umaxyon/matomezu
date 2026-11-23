// 書庫の画面から、ブック・ページ・バインダ・ブックの外のページを窓に出す（開く先は、呼ばれた書庫の置かれた所で決める）。
// 呼ばれたのが、ブックスクリーンと上下に並んだ書庫のスクリーンなら、そのブックスクリーンに開く（「画面を分割」で足した空のステージ、無ければカレントのステージの開いている物を替える）。
// ほかは新しいブックスクリーン（開き分けは store の openToStage）。
// 書庫のスクリーンから開いたら、書庫のスクリーンは閉じる（コントロールセンターの書庫の画面から開いたときは、そのまま）

import { NO_STATE } from "../../../core/def/plugin-state"
import type { OpenTo } from "../../../store/actions"
import {
  arrangementValueIn,
  type CommandActions,
  calledScreenIdOf,
  type ScreenCommandContext,
  screensOf,
  storeActionsOf,
  windowNowOf,
} from "../../../store/commands/def"
import { NO_STAGE } from "../../../store/dialogs"
import { showBookSplit } from "../window/apply-split"
import { SCREEN_FLASH } from "../window/split"
import { tallNow } from "../window/tall"
import type { BookOpened } from "./outline"
import { LIBRARY_SCREEN, leaveLibrary, stageBeside } from "./screen"

// 分割で開くときに一緒に並べる段の数（useShowBook と同じ）
const PAIR = 2

// 呼ばれたのが、ブックスクリーンと上下に並んだ書庫のスクリーンか（開く先が、並びのブックスクリーンに決まっている）
export const opensBeside = (ctx: ScreenCommandContext): boolean =>
  ctx.screen.def === LIBRARY_SCREEN.id &&
  stageBeside(screensOf(ctx), arrangementValueIn(ctx), calledScreenIdOf(ctx)) !== NO_STAGE

// 書庫の行のブック opens を、呼ばれたスクリーンを起点に上下に分けて窓に出す（吹き出しの「分割で開く」と同じ showBookSplit。窓が低ければ窓いっぱいに）
export function openSplitFromLibrary(ctx: ScreenCommandContext, a: CommandActions, opens: BookOpened): void {
  showBookSplit({
    actions: storeActionsOf(a),
    readWindow: windowNowOf(a),
    here: calledScreenIdOf(ctx),
    keepHere: false,
    max: PAIR,
    tall: tallNow(),
    flash: screen => a.updatePluginState(SCREEN_FLASH, was => ({ screen, n: (was === NO_STATE ? 0 : was.n) + 1 })),
    book: opens.book,
    page: opens.page,
  })
}

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
