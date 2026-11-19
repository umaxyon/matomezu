// ステージのコマンド: 分割する・分割をやめる・閉じる
import {
  type CommandContext,
  calledScreenIdOf,
  calledStageOf,
  storeActionsOf,
  workspaceOf,
} from "../../../store/commands/def"
import { NO_STAGE } from "../../../store/dialogs"
import { SCREEN_REFUSED } from "../../../store/store"
import { kit } from "../kit"
import { LIBRARY_SCREEN } from "../library/screen"
import { SPLIT_ROWS } from "../window/split"

const isSplit = (ctx: CommandContext) => workspaceOf(ctx).stages.length > 1

// 画面を分割: 右に何も開いていないステージを足し、窓の下半分に書庫のスクリーンを出す（書庫で選んだ物が、足したステージに開く）。
// 窓が低ければ、分けて並べる窓の決まり（ScreensView）が、書庫だけを窓いっぱいに残す
export const STAGE_SPLIT = kit.defineCommand({
  id: "stage-split",
  title: "Split screen",
  run: (ctx, a) => {
    const store = storeActionsOf(a)
    const here = calledStageOf(ctx)
    if (!here || store.splitStage(here.id) === NO_STAGE) return
    const book = calledScreenIdOf(ctx)
    const library = store.openScreenId(LIBRARY_SCREEN.id, {})
    if (library !== SCREEN_REFUSED) store.setScreenArrangement(SPLIT_ROWS.id, { screens: [book, library], behind: [] })
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
