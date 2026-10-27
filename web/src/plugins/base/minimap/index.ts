// ミニマップ: 紙の全体と見えている範囲を小さく出し、ドラッグで見る所を動かす。ステージの左下に出しておくもの（このコマンドで開閉）と、
// 右ボタンの長押しの道具のアイコンから、その場に出すものがある
import { paperOf, scrolls } from "../../../core/stage"
import type { CommandContext } from "../../../store/commands/def"
import { kit } from "../kit"

// 呼ばれたステージの中の状態（表示領域の大きさと、ミニマップを出しているか）
const stageOf = (ctx: CommandContext) => ctx.workspace.stages.find(s => s.id === ctx.stage.id)

// ステージの左下のミニマップを開く・閉じる。紙が表示領域に収まっていれば押せない
export const MINIMAP_TOGGLE = kit.defineCommand({
  id: "minimap-toggle",
  title: "Minimap",
  run: (ctx, a) => a.setMinimap(ctx.stage.id, !stageOf(ctx)?.minimap),
  when: ctx => paperOf(ctx.stage) !== null,
  enabled: ctx => {
    const stage = stageOf(ctx)
    return stage !== undefined && scrolls(stage)
  },
  active: ctx => stageOf(ctx)?.minimap === true,
})
