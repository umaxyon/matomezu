// マークのプラグイン状態の宣言: マークの種類を選ぶスタンド（付ける先を持ち、マークのレイヤーが最後の物のそばに出す。選ぶかやめると終わる）
import { anchorTargetState } from "../context-menu/anchor-targets"

export const MARK_PICKER = anchorTargetState("mark-picker")

export const MARK_STATES = [MARK_PICKER] as const
