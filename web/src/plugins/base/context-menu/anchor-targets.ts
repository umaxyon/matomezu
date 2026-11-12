// 右クリックで押した物から始める、付ける先を持つプラグイン状態（伝言の下書き・マークの種類を選ぶスタンド）: 種類ごとに宣言を作る（anchorTargetState。ステージごと、画面の場所には入れない）。
// ブックのデータには入れない。始めるのは UI マッピングの anchorMenu に置くコマンドで（startAnchorTarget）、終えるのはその種類のレイヤー
import type { PluginStateDef } from "../../../core/def/plugin-state"
import type { CommandActions, CommandContext } from "../../../store/commands/def"
import { kit } from "../kit"

export interface AnchorTargets {
  anchors: readonly string[] // 付ける先（出す物は最後の物のそばに出す）
}

// 付ける先: 押した物が選んでいる物のうちなら、選んでいる物の全部（押した物を最後にして、出す物は押した物のそばに出す）、でなければ押した物だけ
export function anchorsFor(clicked: string, selection: readonly string[]): readonly string[] {
  return selection.includes(clicked) ? [...selection.filter(s => s !== clicked), clicked] : [clicked]
}

// id（kebab-case）の、付ける先を持つステージのプラグイン状態の宣言（付ける先を持たないときは値が無い）
export const anchorTargetState = <const Id extends string>(id: Id) =>
  kit.definePluginStateOf<AnchorTargets>()({ id, scope: "stage" })

// 宣言 state の付ける先を、押した物 anchor から始めるコマンドの run（選んでいる物の 1 つを押したなら、選んでいる物の全部に付ける）
export const startAnchorTarget =
  (state: PluginStateDef<AnchorTargets>) =>
  (ctx: CommandContext, a: CommandActions, anchor: string): void =>
    a.updatePluginState(state, () => ({ anchors: anchorsFor(anchor, ctx.stage.selection) }))
