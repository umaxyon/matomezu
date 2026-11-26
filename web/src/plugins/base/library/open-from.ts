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
import { kit } from "../kit"
import { refusalMessage } from "../utils/refusal"
import { showBookSplit } from "../window/apply-split"
import { stageAboveLower } from "../window/lower-row"
import { SCREEN_FLASH } from "../window/split"
import { tallNow } from "../window/tall"
import type { BookOpened, Choosing } from "./outline"
import { LIBRARY_REFERENCE_ADD } from "./reference-actions"
import { LIBRARY_SCREEN, leaveLibrary, stageBeside } from "./screen"
import { LIBRARY_CHOOSING, LIBRARY_PICKED } from "./state"

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
  openAndLeave(ctx, a, to, stageBeside)
}

// to を、書庫の画面の場所から stageOf で選ぶステージに開き、書庫のスクリーンからなら書庫を離れて、開いたステージを見せる（開いたステージは残す）
type StageOf = (screens: ReturnType<typeof screensOf>, value: unknown, here: string) => string
function openAndLeave(ctx: ScreenCommandContext, a: CommandActions, to: OpenTo, stageOf: StageOf): void {
  const store = storeActionsOf(a)
  const here = calledScreenIdOf(ctx)
  const screens = screensOf(ctx)
  const value = arrangementValueIn(ctx)
  const stage = store.openToStage(to, stageOf(screens, value, here))
  if (stage === NO_STAGE || ctx.screen.def !== LIBRARY_SCREEN.id) return
  leaveLibrary(store, screens, value, here)
  store.showStage(stage)
}

// 選んでいる物 choosing で選んだ物 chosen（置く先のブックと指す先）に、参照エントリを並びの末尾に置く（断られたらトーストで知らせ、選んでいるまま）。
// 置く参照エントリの指す先を選んでいた（referred）なら、選ぶのをやめ、書庫のスクリーンを閉じて、上の段のステージにそのブックの置いた参照エントリを開く。
// 置くブックを選んでいた（book）なら、選ぶのをやめ（書庫は開いたまま）、置いたとトーストで知らせる
export function placeChosen(
  ctx: ScreenCommandContext,
  a: CommandActions,
  choosing: Choosing,
  chosen: { book: string; of: { kind: "page" | "binder"; id: string } },
): void {
  const done = a.perform(LIBRARY_REFERENCE_ADD.id, chosen)
  if (!done.ok) {
    a.showToast({
      kind: "warn",
      message: refusalMessage(ctx.catalog, done, kit.message("Could not place the reference")),
    })
    return
  }
  a.resetPluginState(LIBRARY_CHOOSING)
  a.resetPluginState(LIBRARY_PICKED)
  if (choosing.choose === "book") {
    const holder = ctx.folders[chosen.book]
    const book = holder?.folderRole === "book" ? holder.title : chosen.book
    a.showToast({ kind: "success", message: kit.message("Placed a reference in {book}"), params: { book } })
    return
  }
  openAndLeave(ctx, a, { to: "book", book: chosen.book, reference: done.result.reference }, stageAboveLower)
}
