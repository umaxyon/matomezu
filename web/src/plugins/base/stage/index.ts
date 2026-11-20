// ステージのコマンド: 分割する・分割をやめる・閉じる

import { SCREEN_REFUSED } from "../../../store/actions"
import {
  arrangementValueIn,
  type CommandContext,
  calledScreenIdOf,
  calledStageOf,
  screensOf,
  storeActionsOf,
  workspaceOf,
} from "../../../store/commands/def"
import { NO_STAGE } from "../../../store/dialogs"
import { kit } from "../kit"
import { LIBRARY_SCREEN } from "../library/screen"
import { SPLIT_ROWS, splitOf } from "../window/split"

const isSplit = (ctx: CommandContext) => workspaceOf(ctx).stages.length > 1

// 画面を分割: 右に何も開いていないステージを足し、窓の下半分に書庫のスクリーンを出す（書庫で選んだ物が、足したステージに開く）。
// 窓が低ければ、分けて並べる窓の決まり（ScreensView）が、書庫のスクリーンだけを窓いっぱいに残す
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
    // 前の並び（コントロールセンターとチケットなど）は behind に覚え、書庫のスクリーンを閉じたら戻す
    const before = splitOf(screensOf(ctx), arrangementValueIn(ctx)).filter(id => id !== library)
    store.setScreenArrangement(SPLIT_ROWS.id, { screens: [book, library], behind: before })
  },
  when: ctx => !isSplit(ctx),
  active: isSplit,
})

export const STAGE_UNSPLIT = kit.defineCommand({
  id: "stage-unsplit",
  title: "Unsplit",
  run: (_ctx, a) => a.unsplit(),
  when: isSplit,
  active: isSplit, // 分割の切り替えのボタンで、分割していることを押されている見た目で示す
})

export const STAGE_CLOSE = kit.defineCommand({
  id: "stage-close",
  title: "Close stage",
  run: (_ctx, a) => a.closeStage(),
  when: isSplit,
})
export {
  BACKGROUND_EDIT,
  BACKGROUND_END,
  BACKGROUND_HIDE_CONTENT,
  BACKGROUND_PRINT_SET,
  BACKGROUND_TOGGLE,
} from "./background"
export { type CONTENT_HIDDEN, type PRINT_AREAS_HIDDEN, STAGE_STATES } from "./states"
