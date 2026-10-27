// インスタンスのコマンドを引き、呼ばれた場所の様子からコマンドを出すか・押せるかを決める操作

import type { CommandId, CommandTable } from "../../core/catalog"
import type { CoreCatalog } from "../../core/core-catalog"
import { fail } from "../../core/errors"
import { inspect } from "../../core/inspect"
import { stageView, toolOf } from "../../core/workspace"
import type { Assembled } from "../plugin"
import type { MatomezuState } from "../store"
import type { CommandContext, CommandDef } from "./def"

export type { CommandId } from "../../core/catalog"

type ArgOf<Id extends CommandId> = CommandTable[Id] extends CommandDef<infer A> ? A : never
// コマンドを呼ぶときに渡す引数の並び（引数の無いコマンドには何も渡さない）
export type CommandArgs<Id extends CommandId> = [ArgOf<Id>] extends [undefined] ? [] : [ArgOf<Id>]

// インスタンスのコマンド。知らない id なら誤り（型に書き足したのに、そのプラグインをインスタンスに渡していないとき）
export function commandDef(defs: Assembled, id: string): CommandDef<never> {
  return defs.catalog.store.commands.get(id) ?? fail("E107", { id })
}

// そのステージから呼んだときの様子。ステージが無ければ null
export function commandContext(
  catalog: CoreCatalog,
  home: string | null,
  state: MatomezuState,
  stageId: string,
): CommandContext | null {
  const stage = state.workspace.stages.find(s => s.id === stageId)
  if (!stage) return null
  const book = stage.opened ? (state.books[stage.opened.book] ?? null) : null
  const { workspace, settings, dialog, contextMenu } = state
  return {
    catalog,
    home,
    stage: stageView(catalog, stage, toolOf(catalog, workspace, stageId)),
    book,
    workspace,
    settings,
    dialog,
    contextMenu,
  }
}

// コマンドが行うアクション（performs）を、どれも今のブック（ブックが対象でなければホームのタイプ）で使えるか
function performable(def: CommandDef<never>, ctx: CommandContext): boolean {
  return (def.performs ?? []).every(
    action => inspect(ctx.catalog, { kind: "action", action, book: ctx.book ?? undefined }, ctx).value === true,
  )
}

// 出すか: 行うアクションが使え、when が出すとするとき
export function isShown(defs: Assembled, state: MatomezuState, stageId: string, id: CommandId): boolean {
  const ctx = commandContext(defs.catalog.core, defs.home, state, stageId)
  const def = commandDef(defs, id)
  return ctx !== null && performable(def, ctx) && def.when(ctx)
}

export function isEnabled(defs: Assembled, state: MatomezuState, stageId: string, id: CommandId): boolean {
  const ctx = commandContext(defs.catalog.core, defs.home, state, stageId)
  const def = commandDef(defs, id)
  return ctx !== null && performable(def, ctx) && def.when(ctx) && (def.enabled?.(ctx) ?? true)
}

export function isActive(defs: Assembled, state: MatomezuState, stageId: string, id: CommandId): boolean {
  const ctx = commandContext(defs.catalog.core, defs.home, state, stageId)
  return ctx !== null && (commandDef(defs, id).active?.(ctx) ?? false)
}
