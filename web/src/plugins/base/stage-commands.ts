// ステージのコマンド: ホームを開く・分割する・分割をやめる・閉じる
import { type CommandContext, defineCommand } from "../../store/commands/def"

const isSplit = (ctx: CommandContext) => ctx.workspace.stages.length > 1

// app のホームのブックを、そのステージで開く（ホームが無い app では出さない）
export const STAGE_HOME = defineCommand({
  id: "stage.home",
  title: "ホーム",
  run: (ctx, a) => {
    if (ctx.home) a.openBook(ctx.stage.id, ctx.home)
  },
  when: ctx => ctx.home !== null,
  active: ctx => ctx.home !== null && ctx.stage.opened?.book === ctx.home,
})

export const STAGE_SPLIT = defineCommand({
  id: "stage.split",
  title: "画面を分割",
  run: (ctx, a) => a.split(ctx.stage.id),
  when: ctx => !isSplit(ctx),
  active: isSplit,
})

export const STAGE_UNSPLIT = defineCommand({
  id: "stage.unsplit",
  title: "分割をやめる",
  run: (ctx, a) => a.unsplit(ctx.stage.id),
  when: isSplit,
  active: isSplit, // 分割の切り替えのボタンで、分割していることを押されている見た目で示す
})

export const STAGE_CLOSE = defineCommand({
  id: "stage.close",
  title: "ステージを閉じる",
  run: (ctx, a) => a.closeStage(ctx.stage.id),
  when: isSplit,
})
