// そのステージから呼ぶコマンド。出すか・押せるかが変わったときだけ描き直す。インスタンスに無いコマンドなら error
import type { MessageKey } from "../core/i18n/i18n"
import { type CommandArgs, type CommandId, commandDef, isActive, isEnabled, isShown } from "../store/commands"
import { useActions, useInstance, useMatomezuState } from "./store-context"

export interface CommandHandle<Id extends CommandId> {
  title: MessageKey
  shown: boolean
  enabled: boolean
  active: boolean // 押されている状態か
  run(...args: CommandArgs<Id>): void
}

// arg は、押す前から分かっている引数（右クリックしたページのように、押せるかが引数で決まるコマンドのとき）
export function useCommand<Id extends CommandId>(stage: string, id: Id, arg?: CommandArgs<Id>[0]): CommandHandle<Id> {
  const defs = useInstance()
  const def = commandDef(defs, id)
  const shown = useMatomezuState(s => isShown(defs, s, stage, id))
  const enabled = useMatomezuState(s => isEnabled(defs, s, stage, id, arg))
  const active = useMatomezuState(s => isActive(defs, s, stage, id))
  const { command } = useActions()
  return { title: def.title, shown, enabled, active, run: (...args) => command(stage, id, ...args) }
}
