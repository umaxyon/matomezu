// インスタンスのコマンドを引き、呼ばれた場所の様子からコマンドを出すか・押せるかを決める操作

import type { CommandId, CommandTable } from "../../core/catalog"
import type { CoreCatalog } from "../../core/core-catalog"
import { fail } from "../../core/errors"
import { NO_HISTORY } from "../../core/history"
import { actionQuery, inspect, withoutPermissions } from "../../core/inspect"
import { splitId } from "../../core/names"
import { stageBlocks } from "../../core/stage"
import { stageView, toolOf } from "../../core/workspace"
import type { Assembled } from "../plugin"
import type { MatomezuState } from "../store"
import { type CommandContext, type CommandDef, commandScopeOf, withWorkspace } from "./def"

export type { CommandId } from "../../core/catalog"

type ArgOf<Id extends CommandId> = CommandTable[Id] extends CommandDef<infer A> ? A : never
// コマンドを呼ぶときに渡す引数の並び（引数の無いコマンドには何も渡さない）
export type CommandArgs<Id extends CommandId> = [ArgOf<Id>] extends [undefined] ? [] : [ArgOf<Id>]

// インスタンスのコマンド。知らない id なら error（型に書き足したのに、そのプラグインをインスタンスに渡していないとき）
export function commandDef(defs: Assembled, id: string): CommandDef<never> {
  return defs.catalog.store.commands.get(id) ?? fail("E107", { id })
}

// コマンドを持つプラグイン（id の頭。組み立てが、どのコマンドの id にも頭があると確かめている）
export const commandOwner = (command: string): string => splitId(command).owner ?? fail("E107", { id: command })

// コマンド command をそのステージから呼んだときの様子。ステージが無ければ null。画面の状態は、コマンドを持つプラグインの置き場だけを読む
export function commandContext(
  catalog: CoreCatalog,
  home: string | null,
  state: MatomezuState,
  stageId: string,
  command: string,
): CommandContext | null {
  const stage = state.workspace.stages.find(s => s.id === stageId)
  if (!stage) return null
  const book = stage.opened ? (state.books[stage.opened.book] ?? null) : null
  const { workspace, settings, dialog, contextMenu } = state
  return withWorkspace(
    {
      catalog,
      home,
      stage: stageView(catalog, stage, toolOf(catalog, workspace, stageId, state.books)),
      book,
      settings,
      dialog,
      contextMenu,
      bookHistory: (book && state.history[book.id]) || NO_HISTORY,
      stageState: state.stageStates[stageId]?.[commandOwner(command)],
    },
    workspace,
  )
}

// コマンドが行うアクション（performs）を、どれも今のブック（ブックが対象でなければホームのタイプ）で使えるか（認可ステップが止めているかは見ない）
function performable(def: CommandDef<never>, ctx: CommandContext): boolean {
  return (def.performs ?? []).every(
    action =>
      withoutPermissions(inspect(ctx.catalog, actionQuery(ctx.catalog, action, ctx.book ?? undefined), ctx)).value ===
      true,
  )
}

// 出すか: 行うアクションが使え、when が出すとするとき
export function isShown(defs: Assembled, state: MatomezuState, stageId: string, id: CommandId): boolean {
  const ctx = commandContext(defs.catalog.core, defs.home, state, stageId, id)
  const def = commandDef(defs, id)
  return ctx !== null && performable(def, ctx) && def.when(ctx)
}

// 行うアクションのどれかを、認可ステップと印刷プレビューの間のステージ（stageBlocks）が止めないか（行うアクションが無ければ止められない）。
// ブックが対象のアクションは、今のブックの許可の範囲の所で問う
function permitted(def: CommandDef<never>, ctx: CommandContext): boolean {
  const actions = def.performs ?? []
  const where = commandScopeOf(def.permissionScope, ctx)
  return (
    actions.length === 0 ||
    actions.some(
      action =>
        !stageBlocks(ctx.catalog, ctx.stage.mode, action) &&
        inspect(ctx.catalog, actionQuery(ctx.catalog, action, ctx.book ?? undefined, where), ctx).value === true,
    )
  )
}

// 押せるか: 出していて、行うアクションのどれかを認可ステップが止めず、enabled が押せるとするとき
export function isEnabled(defs: Assembled, state: MatomezuState, stageId: string, id: CommandId): boolean {
  const ctx = commandContext(defs.catalog.core, defs.home, state, stageId, id)
  const def = commandDef(defs, id)
  return ctx !== null && performable(def, ctx) && def.when(ctx) && permitted(def, ctx) && (def.enabled?.(ctx) ?? true)
}

export function isActive(defs: Assembled, state: MatomezuState, stageId: string, id: CommandId): boolean {
  const ctx = commandContext(defs.catalog.core, defs.home, state, stageId, id)
  return ctx !== null && (commandDef(defs, id).active?.(ctx) ?? false)
}
