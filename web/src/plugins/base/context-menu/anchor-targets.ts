// 右クリックで押した物から始める、付ける先を持つ画面の状態（コメントの下書き・マークの種類を選ぶスタンド）の、base のステージの画面の状態での持ち方:
// 種類ごとの鍵に付ける先を持つ。ブックのデータには入れない。始めるのは配置の anchorMenu に置くコマンドで、終えるのはその種類のレイヤー
import type { CommandActions, CommandContext } from "../../../store/commands/def"

export interface AnchorTargets {
  anchors: readonly string[] // 付ける先（出す物は最後の物のそばに出す）
}

export interface AnchorTargetState {
  // base のステージの画面の状態 state の、付ける先（無ければ null）
  read(state: unknown): AnchorTargets | null
  // base のステージの画面の状態 state の、付ける先を targets にしたもの（null なら終える）
  write(state: unknown, targets: AnchorTargets | null): Record<string, unknown>
  // 押した物 anchor から始めるコマンドの run（選んでいる物の 1 つを押したなら、選んでいる物の全部に付ける）
  start(ctx: CommandContext, actions: CommandActions, anchor: string): void
}

// 付ける先: 押した物が選んでいる物のうちなら、選んでいる物の全部（選んだ順。出す物は最後に選んだ物のそばに出す）、でなければ押した物だけ
export function anchorsFor(clicked: string, selection: readonly string[]): readonly string[] {
  return selection.includes(clicked) ? selection : [clicked]
}

// 鍵 key に付ける先を持つ画面の状態
export function anchorTargetState(key: string): AnchorTargetState {
  const read = (state: unknown) => (state as Record<string, AnchorTargets> | undefined)?.[key] ?? null
  const write = (state: unknown, targets: AnchorTargets | null) => {
    const { [key]: _, ...rest } = (state as Record<string, unknown> | undefined) ?? {}
    return targets ? { ...rest, [key]: targets } : rest
  }
  return {
    read,
    write,
    start: (ctx, a, anchor) =>
      a.updateStageState(ctx.stage.id, now => write(now, { anchors: anchorsFor(anchor, ctx.stage.selection) })),
  }
}
