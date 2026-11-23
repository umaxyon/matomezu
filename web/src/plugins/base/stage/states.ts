// ステージのプラグイン状態の宣言: 背景編集モードで中身を隠しているか、印刷区画の区切りの線を隠しているか（どちらも隠しているときだけ true を持つ）・広げて見せているステージ
import { NO_STATE } from "../../../core/def/plugin-state"
import { kit } from "../kit"

// 中身（ページの普通のアイテム）を隠しているか（背景編集モードの間だけ効く）
export const CONTENT_HIDDEN = kit.definePluginStateOf<boolean>()({
  id: "content-hidden",
  scope: "stage",
  default: false,
})

// 印刷区画の区切りの線を隠しているか（画面の中だけで、読み直すと見せる）
export const PRINT_AREAS_HIDDEN = kit.definePluginStateOf<boolean>()({
  id: "print-areas-hidden",
  scope: "stage",
  default: false,
})

// 分けたステージのうち、広げて見せているステージ wide と、そのとき隠したもう片方 hidden（ブックスクリーンごと。広げていなければ無い）。
// もう片方の列の幅を 0 にする（右サイドパネルを開いたときと同じ）。分けたステージがこの 2 つの時だけ効く（分け直すとステージの id は新しくなるので、前の値は効かない）
export interface WideStage {
  wide: string
  hidden: string
}
export const WIDE_STAGE = kit.definePluginStateOf<WideStage>()({ id: "wide-stage", scope: "screen" })

// 分けたステージ stages の中で、広げて見せるステージ（state の 2 つが今の分けたステージと同じ時だけ。ほかは null）
export const shownWideStage = (stages: readonly string[], state: WideStage | typeof NO_STATE): string | null =>
  state !== NO_STATE && stages.length === 2 && stages.includes(state.wide) && stages.includes(state.hidden)
    ? state.wide
    : null

export const STAGE_STATES = [CONTENT_HIDDEN, PRINT_AREAS_HIDDEN, WIDE_STAGE] as const
