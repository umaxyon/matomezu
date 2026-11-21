// その場の編集の 1 行の入力Form（RichInput）に渡す物: 書いている字はプラグインのステージごとのプラグイン状態 state に置く（確定・取り消しのコマンドが読む）。
// 確定（Enter）と取り消し（Escape）は、入力Formが名乗るキーの範囲 keyScope のキーバインドで受ける（プラグインがその範囲に置く）。焦点が外れたら確定のコマンド commit を行う。
// active はその場の編集をしている間、target は書いている物の id。変換中の字（確定する前）は、入力Formの幅を決めるのにだけ使うので、ここで持つ。
// 書いている途中で確定のコマンドを押せなくなった（認可ステップが止めた）ら、字を捨ててその場の編集を終え、トーストで 1 回知らせる（useEndWhenBlocked）。
// その場の編集が確定・取り消しのほかで終わった（選びや道具が替わったなど）ら、残った字を捨てる（土台はプラグイン状態を読まないので、ここで捨てる）
import { type PointerEvent, useEffect, useRef, useState } from "react"
import type { CommandId } from "../../../core/catalog"
import { useCommand } from "../../../ui/commands"
import { usePluginState, useSetPluginState } from "../../../ui/plugin-state-hooks"
import { useActions } from "../../../ui/view-hooks"
import { kit } from "../kit"
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
  const finish = useEndWhenBlocked(active, commit, () => setDraft(undefined))
  const left = !active && draft !== undefined
  useEffect(() => {
    if (left) setDraft(undefined)
  }, [left, setDraft])
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

// その場の編集の間（active）に、確定のコマンド commit を押せなくなった（認可ステップが止めた）ら、discard で書いている字を捨て、その場の編集を終えて、トーストで 1 回知らせる。
// 押せるようになったら、また知らせる。commit のコマンドを返す
export function useEndWhenBlocked(active: boolean, commit: CommandId, discard: () => void) {
  const finish = useCommand(commit)
  const { setEditing, showToast } = useActions()
  const blocked = active && finish.shown && !finish.enabled
  const told = useRef(false) // 押せなくなったことを知らせたか（押せるようになったら戻す）
  const discardNow = useRef(discard)
  discardNow.current = discard
  useEffect(() => {
    if (!blocked) {
      told.current = false
      return
    }
    if (told.current) return
    told.current = true
    discardNow.current()
    setEditing("none")
    showToast({ kind: "warn", message: kit.message("Can no longer write, so the text was discarded") })
  }, [blocked, setEditing, showToast])
  return finish
}
