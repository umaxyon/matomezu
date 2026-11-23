// コマンドが読む、テキストForm に書いている字（その場の編集の入力Form・伝言のテキストFormなど）: プラグインが自分のステージごとのプラグイン状態に置き（その場の編集は入力Formのフック useInPlaceInput が書く）、
// 確定・取り消し・送るのコマンドが読んで消す。どの物の字かを target に持つ（選びが替わったら、前の物の字は読まない）

import { NO_STATE, type PluginStateDef } from "../../../core/def/plugin-state"
import { openedEntry } from "../../../core/stage"
import type { CommandActions, CommandContext } from "../../../store/commands/def"

// 書いている字（target は書いている物の id）
export interface InPlaceDraft {
  target: string
  text: string
}

// 書いている字を置くプラグイン状態（ステージごと）
export type InPlaceDraftState = PluginStateDef<InPlaceDraft> & { scope: "stage" }

// ctx のステージで、物 target に書いている字（書いていなければ null）
export function inPlaceText(
  ctx: Pick<CommandContext, "pluginState">,
  state: InPlaceDraftState,
  target: string,
): string | null {
  const draft = ctx.pluginState(state)
  return draft !== NO_STATE && draft.target === target ? draft.text : null
}

// その場の編集を終える: continues（足した物を続けて書いていた）なら、先に足した操作の画面の履歴の段を続け（end の変更も同じ段に入れる）、
// end を行ってから、書いている字を消して、その場の編集をやめる
export function endInPlace(
  ctx: Pick<CommandContext, "stage">,
  a: Pick<CommandActions, "continueStep" | "resetPluginState" | "setEditing">,
  state: InPlaceDraftState,
  continues: boolean,
  end: () => void,
): void {
  const entry = openedEntry(ctx.stage.opened)
  if (continues && entry) a.continueStep(entry.id)
  end()
  a.resetPluginState(state)
  a.setEditing("none")
}
