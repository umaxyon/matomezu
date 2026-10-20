// そのステージから呼ぶコマンド。出すか・押せるかが変わったときだけ描き直す
import type { MessageKey } from "../core/i18n/i18n"
import { type CommandArgs, type CommandId, commandDef, isEnabled, isShown } from "../store/commands"
import { useActions, useApp, useRegistry } from "./store-context"

export interface CommandHandle<Id extends CommandId> {
  title: MessageKey
  shown: boolean
  enabled: boolean
  run(...args: CommandArgs<Id>): void
}

export function useCommand<Id extends CommandId>(stage: string, id: Id): CommandHandle<Id> {
  const registry = useRegistry()
  const shown = useApp(s => isShown(registry, s, stage, id))
  const enabled = useApp(s => isEnabled(registry, s, stage, id))
  const { command } = useActions()
  return { title: commandDef(id).title, shown, enabled, run: (...args) => command(stage, id, ...args) }
}
