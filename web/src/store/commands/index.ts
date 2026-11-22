// インスタンスのコマンドを引き、呼ばれた場所の様子からコマンドを出すか・押せるかを決める操作

import { USER } from "../../core/actor"
import type { CommandId, CommandTable } from "../../core/catalog"
import type { CoreCatalog } from "../../core/core-catalog"
import type { Where } from "../../core/def/action"
import type { PluginStateDef } from "../../core/def/plugin-state"
import { namingOf, titleOf } from "../../core/entries"
import { fail } from "../../core/errors"
import { pageIn } from "../../core/folders"
import { outsideBinderIn } from "../../core/folders-tree"
import { LIBRARY_HISTORY, NO_HISTORY } from "../../core/history"
import { actionQuery, type Inspected, inspect, openedQuery, withoutPermissions } from "../../core/inspect"
import { splitId } from "../../core/names"
import { openedAnswer } from "../../core/perform-permit"
import { permittedIn } from "../../core/perform-world"
import { readerOf, sourceOf } from "../../core/record-source"
import { openedBook, shownPageId, stageBlocks } from "../../core/stage"
import {
  currentScreen,
  currentStageOf,
  type OpenedScreen,
  screenOfStage,
  stageIn,
  stageListOf,
  type WindowState,
  workspaceOf,
} from "../../core/window"
import { stageView, toolOf } from "../../core/workspace"
import type { Assembled } from "../plugin"
import { ownedPluginState, placeOf, pluginValueOf } from "../plugin-state"
import type { MatomezuState } from "../state"
import { worldOf } from "../world"
import {
  askedIn,
  type CalledScreen,
  type CommandContext,
  type CommandDef,
  commandScopeOf,
  NO_BOOK,
  NO_OUTSIDE_BINDER,
  NO_PAGE,
  type OpenScreen,
  type ScreenCommandContext,
  type ScreenCommandDef,
  type ScreenFrame,
  type StageCommandDef,
  UNKNOWN_PERFORMED,
  withScreenFrame,
  withUnreadableItems,
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
  stageList: stageListOf(s),
  currentStage: currentStageOf(s),
})

// 窓 win の開いているスクリーン（カレントにした順。最後がカレントスクリーン）を、コマンドの文脈の screensOf の形で
const openScreensOf = (win: WindowState): readonly OpenScreen[] =>
  win.order.flatMap(id => win.screens.filter(s => s.id === id).map(openScreenOf))

const NO_SUBJECTS: readonly string[] = []

// コマンド command を at（ステージの id か、開いているスクリーンの id。どちらでもなければ、スクリーンの外から呼んだ物としてカレントスクリーン）から
// 呼んだときの、スクリーンから呼ぶコマンドの文脈。reads は、コマンドの定義が readsSubjects に書いた、読むレコードの種類。プラグイン状態は、コマンドを持つプラグインの宣言だけを読める
export function screenCommandContext(
  catalog: CoreCatalog,
  controlCenter: string | null,
  state: MatomezuState,
  at: string,
  command: string,
  reads: readonly string[] = NO_SUBJECTS,
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
    pageTitle: page => titleOf(state, "page", page, namingOf(catalog, settings)),
    // スクリーンごとの宣言は呼ばれた場所のスクリーンの値、ステージごとの宣言は呼ばれた場所のステージの値
    pluginState: <S>(def: PluginStateDef<S>) =>
      pluginValueOf(
        state.pluginValues,
        placeOf(def.scope, { stage: at, screen: screen.id }),
        ownedPluginState(commandOwner(command), def),
      ),
    read: readerOf(catalog, sourceOf(state.records), reads),
  }
  return withUnreadableItems(withScreenFrame(ctx, frameOf(win, screen.id)), state.unreadableFolder)
}

// 窓 win の、コマンドの文脈に結ぶほかのスクリーンを名指す物（here は呼ばれた場所のスクリーンの id）
const frameOf = (win: WindowState, here: string): ScreenFrame => ({
  here,
  screens: openScreensOf(win),
  arrangementValue: win.arrangementValue,
})

const NO_ANNOTATIONS: readonly never[] = []

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
  const book = openedBook(state.books, stage.opened) ?? NO_BOOK
  const page = shownPageId(stage.opened)
  const entry = stage.opened?.outermost
  const workspace = workspaceOf(state.window, stageId)
  const screen = screenOfStage(state.window, stageId) ?? currentScreen(state.window)
  return withUnreadableItems(
    withScreenFrame(
      withWorkspace(
        {
          ...screenCommandContext(catalog, controlCenter, state, stageId, command),
          stage: stageView(catalog, stage, toolOf(catalog, workspace, stageId, state)),
          book,
          outsideBinder: (entry?.kind === "binder" && outsideBinderIn(state, entry.id)) || NO_OUTSIDE_BINDER,
          page: (page !== null && pageIn(state.pages, page)) || NO_PAGE,
          history: (stage.opened && state.history[stage.opened.outermost.id]) || NO_HISTORY,
          annotations: (page !== null && state.annotations[page]) || NO_ANNOTATIONS,
        },
        workspace,
        stageId,
        state.books,
      ),
      frameOf(state.window, screen.id),
    ),
    state.unreadableFolder,
  )
}

// コマンド id を at から呼ぶときの、定義と文脈の組（ステージから呼ぶコマンドは、at がステージでなければ null）
type Called =
  | { def: StageCommandDef<never>; ctx: CommandContext }
  | { def: ScreenCommandDef<never>; ctx: ScreenCommandContext }
export function called(defs: Assembled, state: MatomezuState, at: string, id: CommandId | string): Called | null {
  const def = commandDef(defs, id)
  if (def.from === "screen")
    return {
      def,
      ctx: screenCommandContext(
        defs.catalog.core,
        defs.controlCenter,
        state,
        at,
        id,
        def.readsSubjects?.(defs.catalog.core),
      ),
    }
  const ctx = commandContext(defs.catalog.core, defs.controlCenter, state, at, id)
  return ctx ? { def, ctx } : null
}

// 定義 def のメソッド（when・enabled・active）を、その文脈で呼ぶ（定義と文脈の組は called が作るので、種類は合っている）
const ask = (c: Called, method: "when" | "enabled" | "active"): boolean | undefined =>
  (c.def[method] as ((ctx: ScreenCommandContext) => boolean) | undefined)?.(c.ctx)

// コマンドが行うアクション（performs）を、どれも許可スコープの所（ブック・ページ・アノテーションが対象でなければコントロールセンター）で使えるか（認可ステップは見ない）
function performable(c: Called, arg?: unknown): boolean {
  const on = "stage" in c.ctx ? askedIn(c.ctx) : undefined
  const where = whereOf(c, arg)
  return (c.def.performs ?? []).every(
    action => withoutPermissions(openedAnswer(c.ctx.catalog, action, on, where, c.ctx)).value === true,
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

// 行うアクションのどれかを、認可ステップと印刷プレビューの間のステージ（stageBlocks）が止めないか（行うアクションが無ければ止められない。denied: "runs" のコマンドは認可ステップを見ない）。
// ブック・ページ・アノテーションが対象のアクションは、今のブックの許可スコープの所で問う。
// 許可スコープを書いたコマンドが行う、一覧が対象のアクション（戻す・やり直すの置き直しなど）は、開いているブック（ブックの外のページを開いていれば、そのページ）のその所を変える物として扱う
// スクリーンから呼ぶコマンドが行うアクションと引数を名乗れば（performsWith）、その引数で行うときと同じに問い、名乗ったどれかが止められれば押せない
function permitted(c: Called, state: MatomezuState, arg?: unknown): boolean {
  const actions = c.def.performs ?? []
  if (actions.length === 0) return true
  if (!("stage" in c.ctx)) {
    const ctx = c.ctx
    const named = (c.def.from === "screen" && c.def.performsWith?.(ctx, arg as never)) || UNKNOWN_PERFORMED
    if (named !== UNKNOWN_PERFORMED) {
      const world = worldOf(state)
      const asked = { catalog: ctx.catalog, controlCenter: ctx.controlCenter, actor: USER }
      return named.every(n => permittedIn(world, n.action, n.args, undefined, asked).ok)
    }
    return actions.some(action => inspect(ctx.catalog, actionQuery(ctx.catalog, action, undefined), ctx).value === true)
  }
  const ctx = c.ctx
  const where = whereOf(c, arg)
  const on = askedIn(ctx)
  const onOpened = (action: string): boolean =>
    c.def.permissionScope !== undefined && on !== undefined && ctx.catalog.actions.get(action)?.target === "library"
  const answer = (action: string): Inspected<boolean> =>
    on && onOpened(action)
      ? inspect(ctx.catalog, openedQuery(action, on, where), ctx)
      : openedAnswer(ctx.catalog, action, on, where, ctx)
  const runs = c.def.from !== "screen" && c.def.denied === "runs" // 認可ステップに止められても押せる
  return actions.some(
    action =>
      !stageBlocks(ctx.catalog, ctx.stage.mode, action, onOpened(action) ? "opened-entry" : "target") &&
      (runs || answer(action).value === true),
  )
}

// 押せるか: 出していて、行うアクションのどれかを認可ステップが止めず、enabled が押せるとするとき
export function isEnabled(defs: Assembled, state: MatomezuState, at: string, id: CommandId, arg?: unknown): boolean {
  const c = called(defs, state, at, id)
  return (
    c !== null &&
    performable(c, arg) &&
    ask(c, "when") === true &&
    permitted(c, state, arg) &&
    (ask(c, "enabled") ?? true)
  )
}

export function isActive(defs: Assembled, state: MatomezuState, at: string, id: CommandId): boolean {
  const c = called(defs, state, at, id)
  return c !== null && (ask(c, "active") ?? false)
}
