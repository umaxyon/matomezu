// 描いている場所（ui/scope.tsx）から呼ぶコマンド。出すか・押せるかが変わったときだけ描き直す。インスタンスに無いコマンドなら error。
// 呼ぶ場所は向け先で決まる: ステージから呼ぶコマンドは向け先のステージ、スクリーンから呼ぶコマンドはそのスクリーン（向け先がステージなら、それを並べているスクリーン）。
// 向け先が無い所（ステージの外で見るだけに描くページの中）では、どのコマンドも出ず、呼んでも行わない

import type { MessageKey } from "../core/i18n/i18n"
import {
  type CommandArgs,
  type CommandId,
  commandDef,
  commandLook,
  LOOK_ACTIVE,
  LOOK_ENABLED,
  LOOK_SHOWN,
} from "../store/commands"
import { useAt } from "./scope"
import { useInstance, useMatomezuState, useStoreActions } from "./store-context"

export interface CommandHandle<Id extends CommandId> {
  title: MessageKey
  shown: boolean
  enabled: boolean
  active: boolean // 押されている状態か
  run(...args: CommandArgs<Id>): void
}

// given は、押す前から分かっている引数（右クリックしたページのように、押せるかが引数で決まるコマンドのとき。書かなければ、分からない）
export function useCommand<Id extends CommandId>(id: Id, ...given: [arg?: CommandArgs<Id>[0]]): CommandHandle<Id> {
  const defs = useInstance()
  const at = useAt()
  const def = commandDef(defs, id)
  // 出すか・押せるか・押されているかを 1 度に問い、その印が変わったときだけ描き直す
  const look = useMatomezuState(s => (at === null ? 0 : commandLook(defs, s, at, id, ...given)))
  const shown = (look & LOOK_SHOWN) !== 0
  const enabled = (look & LOOK_ENABLED) !== 0
  const active = (look & LOOK_ACTIVE) !== 0
  const { command } = useStoreActions()
  return {
    title: def.title,
    shown,
    enabled,
    active,
    run: (...args) => {
      if (at !== null) command(at, id, ...args)
    },
  }
}
