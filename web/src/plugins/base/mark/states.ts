// マークのプラグイン状態の宣言: マークの種類を選ぶスタンド（付ける先を持ち、マークのレイヤーが最後の物のそばに出す。選ぶかやめると終わる）と、
// この窓で付けたばかりのマークの id（マークのレイヤーが最初に描くときだけ、鳥が飛んでくるか顔を出す。描いたら外す）
import { anchorTargetState } from "../context-menu/anchor-targets"
import { kit } from "../kit"

export const MARK_PICKER = anchorTargetState("mark-picker")

// 付けたばかりのマークが無いときの値
const NONE_ARRIVING: readonly string[] = []

export const MARK_ARRIVING = kit.definePluginStateOf<readonly string[]>()({
  id: "mark-arriving",
  scope: "window",
  default: NONE_ARRIVING,
})

export const MARK_STATES = [MARK_PICKER, MARK_ARRIVING] as const
