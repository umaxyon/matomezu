// インスタンスのコマンドを引き、呼ばれた場所の様子からコマンドを出すか・押せるかを決める操作

import { USER } from "../../core/actor"
import type { CommandId, CommandTable } from "../../core/catalog"
import type { CoreCatalog } from "../../core/core-catalog"
import type { Where } from "../../core/def/action"
import type { PluginStateDef } from "../../core/def/plugin-state"
import { fail } from "../../core/errors"
import { LIBRARY_HISTORY, NO_HISTORY } from "../../core/history"
import { actionQuery, inspect, type Query, withoutPermissions } from "../../core/inspect"
import { splitId } from "../../core/names"
import { shownPageId, stageBlocks } from "../../core/stage"
import {
  currentScreen,
  currentStageOf,
  type OpenedScreen,
  screenOfStage,
  stageIn,
  vacantStagesOf,
  type WindowState,
  workspaceOf,
} from "../../core/window"
import { stageView, toolOf } from "../../core/workspace"
import type { Assembled } from "../plugin"
import { ownedPluginState, pluginValueOf } from "../plugin-state"
import type { MatomezuState } from "../store"
import {
  type CalledScreen,
  type CommandContext,
  type CommandDef,
  commandScopeOf,
  type OpenScreen,
  type ScreenCommandContext,
  type ScreenCommandDef,
  type ScreenFrame,
  type StageCommandDef,
  withScreenFrame,
  withWorkspace,
} from "./def"

export type { CommandId } from "../../core/catalog"

type ArgOf<Id extends CommandId> = CommandTable[Id] extends CommandDef<infer A> ? A : never
// コマンドを呼ぶときに渡す引数の並び（引数の無いコマンドには何も渡さない）
export type CommandArgs<Id extends CommandId> = [ArgOf<Id>] extends [undefined] ? [] : [ArgOf<Id>]

// インスタンスのコマンド。知らない id なら error（型に書き足したのに、そのプラグインをインスタンスに渡していないとき）
export function commandDef(defs: Assembled, id: string): CommandDef<never> {
  return defs.catalog.store.commands.get(id) ?? fail("E107", { id })
}

// コマンドを持つプラグイン（id の頭。台帳アセンブルが、どのコマンドの id にも頭があると確かめている）
export const commandOwner = (command: string): string => splitId(command).owner ?? fail("E107", { id: command })

// 窓 win のスクリーンを、コマンドの文脈が持つ形にした物
const calledScreen = (s: OpenedScreen): CalledScreen => ({
  def: s.def,
  props: s.props,
  stages: s.stages !== undefined,
})
const openScreenOf = (s: OpenedScreen): OpenScreen => ({
  id: s.id,
  ...calledScreen(s),
  vacant: vacantStagesOf(s),
  stage: currentStageOf(s),
})

// 窓 win の開いているスクリーン（カレントにした順。最後がカレントスクリーン）を、コマンドの文脈の screensOf と同じ形で（base の見た目が、コマンドと同じ関数に渡す）
export const openScreensOf = (win: WindowState): readonly OpenScreen[] =>
  win.order.flatMap(id => win.screens.filter(s => s.id === id).map(openScreenOf))

// コマンド command を at（ステージの id か、開いているスクリーンの id。どちらでもなければ、スクリーンの外から呼んだ物としてカレントスクリーン）から
// 呼んだときの、スクリーンから呼ぶコマンドの文脈。プラグイン状態は、コマンドを持つプラグインの宣言だけを読める
export function screenCommandContext(
  catalog: CoreCatalog,
  controlCenter: string | null,
  state: MatomezuState,
  at: string,
  command: string,
): ScreenCommandContext {
  const win = state.window
  const screen = screenOfStage(win, at) ?? win.screens.find(s => s.id === at) ?? currentScreen(win)
  const { settings, dialog, contextMenu } = state
  const ctx: ScreenCommandContext = {
    catalog,
    controlCenter,
    screen: calledScreen(screen),
    arrangement: { id: win.arrangement },
    settings,
    dialog,
    contextMenu,
    libraryHistory: state.history[LIBRARY_HISTORY] ?? NO_HISTORY,
    folders: state.folders,
    // スクリーンごとの宣言は呼ばれた場所のスクリーンの値、ステージごとの宣言は呼ばれた場所のステージの値
    pluginState: <S>(def: PluginStateDef<S>) =>
      pluginValueOf(
        state.pluginValues,
        def.scope === "screen" ? screen.id : at,
        ownedPluginState(commandOwner(command), def),
      ),
  }
  return withScreenFrame(ctx, frameOf(win, screen.id))
}

// 窓 win の、コマンドの文脈に結ぶほかのスクリーンを名指す物（here は呼ばれた場所のスクリーンの id）
const frameOf = (win: WindowState, here: string): ScreenFrame => ({
  here,
  screens: openScreensOf(win),
  arrangementValue: win.arrangementValue,
})

// コマンド command をステージ stageId から呼んだときの、ステージから呼ぶコマンドの文脈。ステージが無ければ null
export function commandContext(
  catalog: CoreCatalog,
  controlCenter: string | null,
  state: MatomezuState,
  stageId: string,
  command: string,
): CommandContext | null {
  const stage = stageIn(state.window, stageId)
  if (!stage) return null
  const book = stage.opened ? (state.books[stage.opened.book] ?? null) : null
  const workspace = workspaceOf(state.window, stageId)
  const screen = screenOfStage(state.window, stageId) ?? currentScreen(state.window)
  return withScreenFrame(
    withWorkspace(
      {
        ...screenCommandContext(catalog, controlCenter, state, stageId, command),
        stage: stageView(catalog, stage, toolOf(catalog, workspace, stageId, state.books)),
        book,
        bookHistory: (book && state.history[book.id]) || NO_HISTORY,
      },
      workspace,
      stageId,
      state.books,
    ),
    frameOf(state.window, screen.id),
  )
}

// コマンド id を at から呼ぶときの、定義と文脈の組（ステージから呼ぶコマンドは、at がステージでなければ null）
type Called =
  | { def: StageCommandDef<never>; ctx: CommandContext }
  | { def: ScreenCommandDef<never>; ctx: ScreenCommandContext }
export function called(defs: Assembled, state: MatomezuState, at: string, id: CommandId | string): Called | null {
  const def = commandDef(defs, id)
  if (def.from === "screen")
    return { def, ctx: screenCommandContext(defs.catalog.core, defs.controlCenter, state, at, id) }
  const ctx = commandContext(defs.catalog.core, defs.controlCenter, state, at, id)
  return ctx ? { def, ctx } : null
}

// 定義 def のメソッド（when・enabled・active）を、その文脈で呼ぶ（定義と文脈の組は called が作るので、種類は合っている）
const ask = (c: Called, method: "when" | "enabled" | "active"): boolean | undefined =>
  (c.def[method] as ((ctx: ScreenCommandContext) => boolean) | undefined)?.(c.ctx)

// コマンドが行うアクション（performs）を、どれも許可スコープの所（ブック・ページ・アノテーションが対象でなければコントロールセンター）で使えるか（認可ステップは見ない）
function performable(c: Called, arg?: unknown): boolean {
  const book = "book" in c.ctx ? (c.ctx.book ?? undefined) : undefined
  const where = whereOf(c, arg)
  return (c.def.performs ?? []).every(
    action =>
      withoutPermissions(inspect(c.ctx.catalog, actionQuery(c.ctx.catalog, action, book, where), c.ctx)).value === true,
  )
}

// 使えるかを問う所: コマンドの許可スコープの所。書いていない・引数がまだ無くて分からないなら、開いているページ（ページのタイプで決まるアクションを、ブック全体として問わないように）
function whereOf(c: Called, arg?: unknown): Where | undefined {
  if (!("stage" in c.ctx)) return undefined
  const page = shownPageId(c.ctx.stage.opened ?? null)
  return commandScopeOf(c.def.permissionScope, c.ctx, arg) ?? (page === null ? undefined : { page })
}

// 出すか: 行うアクションが使え、when が出すとするとき（arg は、押す前から分かっている引数）
export function isShown(defs: Assembled, state: MatomezuState, at: string, id: CommandId, arg?: unknown): boolean {
  const c = called(defs, state, at, id)
  return c !== null && performable(c, arg) && ask(c, "when") === true
}

// 行うアクションのどれかを、認可ステップと印刷プレビューの間のステージ（stageBlocks）が止めないか（行うアクションが無ければ止められない）。
// ブック・ページ・アノテーションが対象のアクションは、今のブックの許可スコープの所で問う。
// 許可スコープを書いたコマンドが行う、一覧が対象のアクション（戻す・やり直すの置き直しなど）は、開いているブックのその所を変える物として扱う
function permitted(c: Called, arg?: unknown): boolean {
  const actions = c.def.performs ?? []
  if (actions.length === 0) return true
  if (!("stage" in c.ctx)) {
    const ctx = c.ctx
    return actions.some(action => inspect(ctx.catalog, actionQuery(ctx.catalog, action, undefined), ctx).value === true)
  }
  const ctx = c.ctx
  const where = whereOf(c, arg)
  const book = ctx.book
  const onOpened = (action: string): boolean =>
    c.def.permissionScope !== undefined && book !== null && ctx.catalog.actions.get(action)?.target === "library"
  const query = (action: string): Query =>
    book && onOpened(action)
      ? { kind: "action", action, actor: USER, book, ...(where ? { where } : {}) }
      : actionQuery(ctx.catalog, action, book ?? undefined, where)
  return actions.some(
    action =>
      !stageBlocks(ctx.catalog, ctx.stage.mode, action, onOpened(action) ? "opened-book" : "target") &&
      inspect(ctx.catalog, query(action), ctx).value === true,
  )
}

// 押せるか: 出していて、行うアクションのどれかを認可ステップが止めず、enabled が押せるとするとき
export function isEnabled(defs: Assembled, state: MatomezuState, at: string, id: CommandId, arg?: unknown): boolean {
  const c = called(defs, state, at, id)
  return (
    c !== null && performable(c, arg) && ask(c, "when") === true && permitted(c, arg) && (ask(c, "enabled") ?? true)
  )
}

export function isActive(defs: Assembled, state: MatomezuState, at: string, id: CommandId): boolean {
  const c = called(defs, state, at, id)
  return c !== null && (ask(c, "active") ?? false)
}
