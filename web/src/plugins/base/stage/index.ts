// ステージのコマンド: 分割する・分割をやめる・閉じる
import { type CommandContext, workspaceOf } from "../../../store/commands/def"
import { kit } from "../kit"

const isSplit = (ctx: CommandContext) => workspaceOf(ctx).stages.length > 1

export const STAGE_SPLIT = kit.defineCommand({
  id: "stage-split",
  title: "Split screen",
  run: (_ctx, a) => a.split(),
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
