// ステージのコマンド: マスターを開く・分割する・分割をやめる・閉じる
import { type CommandContext, defineCommand } from "./def"

const isSplit = (ctx: CommandContext) => ctx.workspace.stages.length > 1

export const STAGE_MASTER = defineCommand({
  id: "stage.master",
  title: "マスター",
  run: (ctx, a) => a.openMaster(ctx.stage.id),
  when: () => true,
})

export const STAGE_SPLIT = defineCommand({
  id: "stage.split",
  title: "画面を分割",
  run: (ctx, a) => a.split(ctx.stage.id),
  when: ctx => !isSplit(ctx),
})

export const STAGE_UNSPLIT = defineCommand({
  id: "stage.unsplit",
  title: "分割をやめる",
  run: (ctx, a) => a.unsplit(ctx.stage.id),
  when: isSplit,
})

export const STAGE_CLOSE = defineCommand({
  id: "stage.close",
  title: "ステージを閉じる",
  run: (ctx, a) => a.closeStage(ctx.stage.id),
  when: isSplit,
})
