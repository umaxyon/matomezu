// 描いている場所（ui/scope.tsx）から呼ぶコマンド。出すか・押せるかが変わったときだけ描き直す。インスタンスに無いコマンドなら error。
// 呼ぶ場所は向け先で決まる: ステージから呼ぶコマンドは向け先のステージ、スクリーンから呼ぶコマンドはそのスクリーン（向け先がステージなら、それを並べているスクリーン）。
// 向け先が無い所（見るだけのページの中）では、どのコマンドも出ず、呼んでも行わない
import type { MessageKey } from "../core/i18n/i18n"
import { type CommandArgs, type CommandId, commandDef, isActive, isEnabled, isShown } from "../store/commands"
import { checkLegacy, useAt, useScope } from "./scope"
import { useActions, useInstance, useMatomezuState } from "./store-context"

export interface CommandHandle<Id extends CommandId> {
  title: MessageKey
  shown: boolean
  enabled: boolean
  active: boolean // 押されている状態か
  run(...args: CommandArgs<Id>): void
}

// arg は、押す前から分かっている引数（右クリックしたページのように、押せるかが引数で決まるコマンドのとき）
export function useCommand<Id extends CommandId>(id: Id, arg?: CommandArgs<Id>[0]): CommandHandle<Id>
// 橋渡しの間だけ: 古い形（第 1 引数にステージの id）
export function useCommand<Id extends CommandId>(legacy: string, id: Id, arg?: CommandArgs<Id>[0]): CommandHandle<Id>
export function useCommand<Id extends CommandId>(...given: readonly unknown[]): CommandHandle<Id> {
  const defs = useInstance()
  // 古い形は、第 1 引数がコマンドの id でない（ステージの id）
  const old = !defs.catalog.store.commands.has(given[0] as string)
  const id = (old ? given[1] : given[0]) as Id
  const arg = (old ? given[2] : given[1]) as CommandArgs<Id>[0] | undefined
  checkLegacy(useScope(), old ? (given[0] as string) : undefined, "useCommand")
  const at = useAt()
  const def = commandDef(defs, id)
  const shown = useMatomezuState(s => at !== null && isShown(defs, s, at, id))
  const enabled = useMatomezuState(s => at !== null && isEnabled(defs, s, at, id, arg))
  const active = useMatomezuState(s => at !== null && isActive(defs, s, at, id))
  const { command } = useActions()
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
