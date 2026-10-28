// 拡大縮小: ステージの倍率を段（ZOOMS）から選ぶ拡大・縮小と、開いたときの見え方（倍率 100%・最初の位置）に戻すコマンド（キーの既定は Home）。
// 拡大・縮小は、表示領域の中の点 at の下の紙の点を動かさない（null なら表示領域の真ん中。Ctrl+ホイールはポインタの下を渡す。stage/StageView.tsx）
import type { Point } from "../../../core/geom"
import { paperOf, resetView } from "../../../core/stage"
import type { CommandContext } from "../../../store/commands/def"
import { kit } from "../kit"

export const ZOOMS = [0.5, 0.75, 1, 1.25] as const

// 倍率 zoom から段を dir（1 で大きく、-1 で小さく）だけ動かした倍率。段の間なら近い段から数える
export function stepZoom(zoom: number, dir: 1 | -1): number {
  const far = ZOOMS.map(z => Math.abs(z - zoom))
  const near = far.indexOf(Math.min(...far))
  return ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, near + dir))] ?? zoom
}

// 呼ばれたステージの中の状態（表示領域の大きさとずらす量）
const stageOf = (ctx: CommandContext) => ctx.workspace.stages.find(s => s.id === ctx.stage.id)

export const ZOOM_IN = kit.defineCommand({
  id: "zoom-in",
  title: "Zoom in",
  run: (ctx, a, at: Point | null) => a.zoomStage(ctx.stage.id, stepZoom(ctx.stage.zoom, 1), at ?? undefined),
  when: ctx => paperOf(ctx.stage) !== null,
  enabled: ctx => stepZoom(ctx.stage.zoom, 1) !== ctx.stage.zoom,
})

export const ZOOM_OUT = kit.defineCommand({
  id: "zoom-out",
  title: "Zoom out",
  run: (ctx, a, at: Point | null) => a.zoomStage(ctx.stage.id, stepZoom(ctx.stage.zoom, -1), at ?? undefined),
  when: ctx => paperOf(ctx.stage) !== null,
  enabled: ctx => stepZoom(ctx.stage.zoom, -1) !== ctx.stage.zoom,
})

// 開いたときの見え方に戻す（もうその見え方なら押せない）
export const ZOOM_RESET = kit.defineCommand({
  id: "zoom-reset",
  title: "Reset view",
  run: (ctx, a) => a.resetStageView(ctx.stage.id),
  when: ctx => paperOf(ctx.stage) !== null,
  enabled: ctx => {
    const stage = stageOf(ctx)
    return stage !== undefined && resetView(stage) !== stage
  },
})

export const ZOOM_KEYS = [kit.defineKey({ id: "zoom-reset-home", key: "Home", command: ZOOM_RESET.id, scope: "stage" })]
