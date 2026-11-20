// その場の編集の 1 行の入力Form（RichInput）に渡す物: 書いている字はプラグインのステージごとのプラグイン状態 state に置く（確定・取り消しのコマンドが読む）。
// 確定（Enter）と取り消し（Escape）は、入力Formが名乗るキーの範囲 keyScope のキーバインドで受ける（プラグインがその範囲に置く）。焦点が外れたら確定のコマンド commit を行う。
// active はその場の編集をしている間、target は書いている物の id。変換中の字（確定する前）は、入力Formの幅を決めるのにだけ使うので、ここで持つ
import { type PointerEvent, useState } from "react"
import type { CommandId } from "../../../core/catalog"
import { useCommand } from "../../../ui/commands"
import { usePluginState, useSetPluginState } from "../../../ui/view-hooks"
import type { InPlaceDraftState } from "../utils/in-place"

export function useInPlaceInput(
  owner: Parameters<typeof usePluginState>[0],
  state: InPlaceDraftState,
  {
    target,
    active,
    keyScope,
    commit,
  }: { target: string | undefined; active: boolean; keyScope: string; commit: CommandId },
) {
  const draft = usePluginState(owner, state)
  const setDraft = useSetPluginState(owner, state)
  const [composing, setComposing] = useState<string | null>(null)
  const finish = useCommand(commit)
  const text = active && target !== undefined && draft?.target === target ? draft.text : null
  return {
    text, // 書いている字（書いていない・まだ変えていなければ null）
    composing: active ? composing : null, // 変換中の字
    // RichInput に渡す物（value・label・見た目は呼び手が渡す）
    input: {
      autoFocus: true,
      multiline: false,
      data: { "data-key-scope": keyScope },
      onChange: (next: string) => {
        if (target !== undefined) setDraft({ target, text: next })
      },
      onCompose: setComposing,
      onPointerDown: (e: PointerEvent) => e.stopPropagation(),
      onBlur: () => {
        setComposing(null)
        if (active) finish.run()
      },
    },
    // 書いている途中なら確定する（ほかの物を押したとき、入力Formが外れるより先に選びが替わるので、押したときに確定する）
    settle: () => {
      if (active) finish.run()
    },
  }
}
