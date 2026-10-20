// app のコマンドを引き、呼ばれた場所の様子からコマンドを出すか・押せるかを決める操作
import { fail } from "../../core/errors"
import type { Registry } from "../../core/registry"
import type { AppDefs } from "../plugin"
import type { AppState } from "../store"
import type { CommandId, CommandTable } from "../tables"
import type { CommandContext, CommandDef } from "./def"

export type { CommandId } from "../tables"

type ArgOf<Id extends CommandId> = CommandTable[Id] extends CommandDef<infer A> ? A : never
// コマンドを呼ぶときに渡す引数の並び（引数の無いコマンドには何も渡さない）
export type CommandArgs<Id extends CommandId> = [ArgOf<Id>] extends [undefined] ? [] : [ArgOf<Id>]

// app のコマンド。知らない id なら誤り（型に書き足したのに、そのプラグインを app に渡していないとき）
export function commandDef(defs: AppDefs, id: string): CommandDef<never> {
  return defs.commands.get(id) ?? fail("E107", { id })
}

// そのステージから呼んだときの様子。ステージが無ければ null
export function commandContext(
  registry: Registry,
  home: string | null,
  state: AppState,
  stageId: string,
): CommandContext | null {
  const stage = state.workspace.stages.find(s => s.id === stageId)
  if (!stage) return null
  const book = stage.opened ? (state.books[stage.opened.book] ?? null) : null
  return { registry, home, stage, book, workspace: state.workspace, settings: state.settings }
}

export function isShown(defs: AppDefs, state: AppState, stageId: string, id: CommandId): boolean {
  const ctx = commandContext(defs.registry, defs.home, state, stageId)
  return ctx !== null && commandDef(defs, id).when(ctx)
}

export function isEnabled(defs: AppDefs, state: AppState, stageId: string, id: CommandId): boolean {
  const ctx = commandContext(defs.registry, defs.home, state, stageId)
  const def = commandDef(defs, id)
  return ctx !== null && def.when(ctx) && (def.enabled?.(ctx) ?? true)
}

export function isActive(defs: AppDefs, state: AppState, stageId: string, id: CommandId): boolean {
  const ctx = commandContext(defs.registry, defs.home, state, stageId)
  return ctx !== null && (commandDef(defs, id).active?.(ctx) ?? false)
}
