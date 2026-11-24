// ステージのコマンド: 分割する・分割をやめる・閉じる

import { NO_STATE } from "../../../core/def/plugin-state"
import { SCREEN_REFUSED } from "../../../store/actions"
import {
  type CommandContext,
  calledScreenIdOf,
  calledStageOf,
  storeActionsOf,
  workspaceOf,
} from "../../../store/commands/def"
import { NO_STAGE } from "../../../store/dialogs"
import { kit } from "../kit"
import { LIBRARY_SCREEN } from "../library/screen"
import { applySplitFrom } from "../window/apply-split"
import { shownWideStage, WIDE_STAGE } from "./states"

const isSplit = (ctx: CommandContext) => workspaceOf(ctx).stages.length > 1

// 画面を分割: 右に何も開いていないステージを足し、窓の下半分に書庫のスクリーンを出す（書庫で選んだ物が、足したステージに開く）。
// 窓が低ければ、分けて並べる窓の決まり（ScreensView）が、カレントスクリーンだけを窓いっぱいに見せる
export const STAGE_SPLIT = kit.defineCommand({
  id: "stage-split",
  title: "Split screen",
  run: (ctx, a) => {
    const store = storeActionsOf(a)
    const here = calledStageOf(ctx)
    if (!here || store.splitStage(here.id) === NO_STAGE) return
    const book = calledScreenIdOf(ctx)
    const library = store.openScreenId(LIBRARY_SCREEN.id, {})
    if (library === SCREEN_REFUSED) return
    applySplitFrom(store, { screens: [book, library], current: library })
  },
  when: ctx => !isSplit(ctx),
  active: isSplit,
})

export const STAGE_UNSPLIT = kit.defineCommand({
  id: "stage-unsplit",
  title: "Unsplit",
  run: (_ctx, a) => {
    a.unsplit()
    a.resetPluginState(WIDE_STAGE)
  },
  when: isSplit,
  active: isSplit, // 分割の切り替えのボタンで、分割していることを押されている見た目で示す
})

// 分けたステージのうち、呼ばれたステージだけを広げて見せる（もう一度で戻す）
export const STAGE_WIDEN = kit.defineCommand({
  id: "stage-widen",
  title: "Widen stage",
  run: (ctx, a) => {
    const here = calledStageOf(ctx)
    const other = workspaceOf(ctx).stages.find(st => st.id !== here?.id)
    if (!here || !other) return
    const stages = workspaceOf(ctx).stages.map(st => st.id)
    const widened = shownWideStage(stages, ctx.pluginState(WIDE_STAGE)) === here.id
    a.updatePluginState(WIDE_STAGE, () => (widened ? NO_STATE : { wide: here.id, hidden: other.id }))
    // 広げたステージをカレントにする（隠れた側にキーが効かないように）
    if (!widened) storeActionsOf(a).focusStage(here.id)
  },
  when: isSplit,
  active: ctx =>
    shownWideStage(
      workspaceOf(ctx).stages.map(st => st.id),
      ctx.pluginState(WIDE_STAGE),
    ) === calledStageOf(ctx)?.id,
})

export const STAGE_CLOSE = kit.defineCommand({
  id: "stage-close",
  title: "Close stage",
  run: (_ctx, a) => {
    a.closeStage()
    a.resetPluginState(WIDE_STAGE)
  },
  when: isSplit,
})
export {
  BACKGROUND_EDIT,
  BACKGROUND_END,
  BACKGROUND_HIDE_CONTENT,
  BACKGROUND_PRINT_SET,
  BACKGROUND_TOGGLE,
} from "./background"
export { type CONTENT_HIDDEN, type PRINT_AREAS_HIDDEN, STAGE_STATES, WIDE_STAGE } from "./states"
