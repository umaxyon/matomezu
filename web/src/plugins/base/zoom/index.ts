// 拡大縮小: ステージの倍率は ZOOM_MIN～ZOOM_MAX の無段階（1% 単位）。拡大・縮小のコマンドは BUTTON_STEP の倍数へ 1 つずつ動き、
// ホイールの拡大縮小のコマンドは、回した量に合わせて倍率をかける（wheelZoom。ステージの Ctrl+ホイールは stage/StageView.tsx が、
// 拡大縮小の帯の上のホイールは ZoomBar が、回した量と位置をそのまま渡す）。
// 拡大・縮小は、表示領域の中の点 at の下の紙の点を動かさない（null なら表示領域の真ん中。Ctrl+ホイールはポインタの下を渡す）。
// 開いたときの見え方（倍率 100%・最初の位置）に戻すコマンド（キーの既定は Home）と、ページの紙全体を表示領域に収めるコマンド（ZOOM_MIN より小さくはしない）
import type { Point, Size } from "../../../core/geom"
import { extentOf, panBy, paperOf, resetView, type Stage, zoomTo } from "../../../core/stage"
import { MARGIN } from "../../../core/viewport"
import { type CommandContext, workspaceOf } from "../../../store/commands/def"
import type { Actions } from "../../../store/store"
import { kit } from "../kit"

export const ZOOM_MIN = 0.3
export const ZOOM_MAX = 1.8
const BUTTON_STEP = 0.1 // 拡大・縮小のボタンで動く倍率
const WHEEL_RATE = 0.0015 // Ctrl+ホイールで、回した量 1 あたりにかける倍率の指数
const FIT_PAD = 24 // 全体を収めるときに、紙の周りに残す表示領域の余白（px）

// 倍率を範囲に収め、1% 単位にする
export const clampZoom = (zoom: number): number => Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)) * 100) / 100

// 倍率 zoom から、dir（1 で大きく、-1 で小さく）の向きの次の BUTTON_STEP の倍数（範囲の端ではそのまま）
export function stepZoom(zoom: number, dir: 1 | -1): number {
  const steps = Math.round(zoom * 1000) / (BUTTON_STEP * 1000)
  const next = dir > 0 ? Math.floor(steps) + 1 : Math.ceil(steps) - 1
  return clampZoom(next * BUTTON_STEP)
}

// Ctrl+ホイールで回した量 delta（下へ回すと正）をかけた倍率
export const wheelZoom = (zoom: number, delta: number): number => clampZoom(zoom * Math.exp(-delta * WHEEL_RATE))

// 大きさ size（倍率 1 の px）の物が、表示領域 view に周りへ pad の余白を残して入る倍率（ZOOM_MIN～max。1% 単位）
export const fitZoom = (size: Size, view: Size, pad: number, max = ZOOM_MAX): number =>
  Math.round(
    Math.min(max, Math.max(ZOOM_MIN, Math.min((view.w - 2 * pad) / size.w, (view.h - 2 * pad) / size.h))) * 100,
  ) / 100

// 倍率を変えられるステージか: 紙を置いているか、印刷プレビューの間（紙を置かない見せ方のブックでも、並べた印刷区画をずらし、倍率を変える）
const zoomable = (ctx: CommandContext): boolean => paperOf(ctx.stage) !== null || ctx.stage.mode === "print-preview"

// ページの紙全体（可変ページは、見せ方が知らせた広さ全体。印刷プレビューは並べた印刷区画の全体）を表示領域に収めた見え方: 収まる倍率（ZOOM_MIN～ZOOM_MAX）にして、紙を真ん中に置く。紙か表示領域が無ければそのまま
export function fitView(stage: Stage): Stage {
  const paper = extentOf(stage)
  const view = stage.view
  if (!paper || !view) return stage
  const zoom = fitZoom(paper, view, FIT_PAD)
  const zoomed = zoomTo(stage, zoom)
  const pan = { x: view.w / 2 - MARGIN - (paper.w * zoom) / 2, y: view.h / 2 - MARGIN - (paper.h * zoom) / 2 }
  return panBy(zoomed, pan.x - zoomed.pan.x, pan.y - zoomed.pan.y)
}

// ステージの見え方（倍率とずらす量）
export type ViewAt = Pick<Stage, "zoom" | "pan">

// ステージ stage を、見え方 target（倍率とずらす量）へ移す: 倍率を変えてから（ずらす量はストアと同じ zoomTo で決まる）、target のずらす量との差だけずらす
export function moveView(a: Pick<Actions, "zoomStage" | "panStageBy">, stage: Stage, target: ViewAt): void {
  const zoomed = zoomTo(stage, target.zoom)
  a.zoomStage(stage.id, target.zoom)
  a.panStageBy(stage.id, target.pan.x - zoomed.pan.x, target.pan.y - zoomed.pan.y)
}

// 呼ばれたステージの中の状態（表示領域の大きさとずらす量）
const stageOf = (ctx: CommandContext) => workspaceOf(ctx).stages.find(s => s.id === ctx.stage.id)

export const ZOOM_IN = kit.defineCommand({
  id: "zoom-in",
  title: "Zoom in",
  run: (ctx, a, at: Point | null) => a.zoomStage(ctx.stage.id, stepZoom(ctx.stage.zoom, 1), at ?? undefined),
  when: zoomable,
  enabled: ctx => stepZoom(ctx.stage.zoom, 1) !== ctx.stage.zoom,
})

export const ZOOM_OUT = kit.defineCommand({
  id: "zoom-out",
  title: "Zoom out",
  run: (ctx, a, at: Point | null) => a.zoomStage(ctx.stage.id, stepZoom(ctx.stage.zoom, -1), at ?? undefined),
  when: zoomable,
  enabled: ctx => stepZoom(ctx.stage.zoom, -1) !== ctx.stage.zoom,
})

// ホイールの拡大縮小: 回した量 delta（下へ回すと正）に合わせて倍率をかける。表示領域の中の点 at（無ければ真ん中）の下の紙の点は動かさない
export const ZOOM_WHEEL = kit.defineCommand({
  id: "zoom-wheel",
  title: "Zoom",
  run: (ctx, a, wheel: { delta: number; at?: Point }) =>
    a.zoomStage(ctx.stage.id, wheelZoom(ctx.stage.zoom, wheel.delta), wheel.at),
  when: zoomable,
})

// 開いたときの見え方に戻す（もうその見え方なら押せない）
export const ZOOM_RESET = kit.defineCommand({
  id: "zoom-reset",
  title: "Reset view",
  run: (ctx, a) => a.resetStageView(ctx.stage.id),
  when: zoomable,
  enabled: ctx => {
    const stage = stageOf(ctx)
    return stage !== undefined && resetView(stage) !== stage
  },
})

// ページの紙全体を表示領域に収める（もう収めた見え方なら押せない）
export const ZOOM_FIT = kit.defineCommand({
  id: "zoom-fit",
  title: "Fit the page",
  run: (ctx, a) => {
    const stage = stageOf(ctx)
    if (stage) moveView(a, stage, fitView(stage))
  },
  when: zoomable,
  enabled: ctx => {
    const stage = stageOf(ctx)
    return stage !== undefined && fitView(stage) !== stage
  },
})

export const ZOOM_KEYS = [kit.defineKey({ id: "zoom-reset-home", key: "Home", command: ZOOM_RESET.id, scope: "stage" })]
