// そのステージから呼ぶコマンド。出すか・押せるかが変わったときだけ描き直す。インスタンスに無いコマンドなら誤り
import type { MessageKey } from "../core/i18n/i18n"
import { type CommandArgs, type CommandId, commandDef, isActive, isEnabled, isShown } from "../store/commands"
import { useActions, useApp, useInstance } from "./store-context"

export interface CommandHandle<Id extends CommandId> {
  title: MessageKey
  shown: boolean
  enabled: boolean
  active: boolean // 押されている状態か
  run(...args: CommandArgs<Id>): void
}

export function useCommand<Id extends CommandId>(stage: string, id: Id): CommandHandle<Id> {
  const defs = useInstance()
  const def = commandDef(defs, id)
  const shown = useApp(s => isShown(defs, s, stage, id))
  const enabled = useApp(s => isEnabled(defs, s, stage, id))
  const active = useApp(s => isActive(defs, s, stage, id))
  const { command } = useActions()
  return { title: def.title, shown, enabled, active, run: (...args) => command(stage, id, ...args) }
}
