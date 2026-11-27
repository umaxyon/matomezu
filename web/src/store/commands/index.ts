// インスタンスのコマンドを引き、呼ばれた場所の様子からコマンドを出すか・押せるかを決める操作

import { USER } from "../../core/actor"
import type { CommandId, CommandTable } from "../../core/catalog"
import type { CoreCatalog } from "../../core/core-catalog"
import type { NO_CONTROL_CENTER, Where } from "../../core/def/action"
import { stateRead } from "../../core/def/plugin-state"
import { NO_NAME, namingOf, titleOf } from "../../core/entries"
import { fail } from "../../core/errors"
import { pageIn } from "../../core/folders"
import { outsideBinderIn } from "../../core/folders-tree"
import { LIBRARY_HISTORY, NO_HISTORY } from "../../core/history"
import { actionQuery, type Inspected, inspect, openedQuery, withoutPermissions } from "../../core/inspect"
import { openablePage } from "../../core/library"
import { splitId } from "../../core/names"
import { openedAnswer } from "../../core/perform-permit"
import { permittedIn } from "../../core/perform-world"
import { readerOf, sourceOf } from "../../core/record-source"
import { openedBook, openedEntry, shownPageId, stageBlocks } from "../../core/stage"
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
import { NO_DIALOG } from "../dialogs"
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
  controlCenter: string | typeof NO_CONTROL_CENTER,
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
    dialog: dialog ?? NO_DIALOG,
    contextMenuOpen: contextMenu !== null,
    libraryHistory: state.history[LIBRARY_HISTORY] ?? NO_HISTORY,
    folders: state.folders,
    pageTitle: page => titleOf(state, "page", page, namingOf(catalog, settings)) ?? NO_NAME,
    pageOf: page => openablePage(state, page)?.page ?? NO_PAGE,
    // スクリーンごとの宣言は呼ばれた場所のスクリーンの値、ステージごとの宣言は呼ばれた場所のステージの値
    pluginState: def =>
      stateRead(
        def,
        pluginValueOf(
          state.pluginValues,
          placeOf(def.scope, { stage: at, screen: screen.id }),
          ownedPluginState(commandOwner(command), def),
        ),
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
  controlCenter: string | typeof NO_CONTROL_CENTER,
  state: MatomezuState,
  stageId: string,
  command: string,
): CommandContext | null {
  const stage = stageIn(state.window, stageId)
  if (!stage) return null
  const book = openedBook(state.books, stage.opened) ?? NO_BOOK
  const page = shownPageId(stage.opened)
  const entry = openedEntry(stage.opened)
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
          page: (page !== NO_PAGE && pageIn(state.pages, page)) || NO_PAGE,
          history: (entry && state.history[entry.id]) || NO_HISTORY,
          annotations: (page !== NO_PAGE && state.annotations[page]) || NO_ANNOTATIONS,
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
// 同じインスタンス・同じ状態で、同じ場所から同じコマンドを呼ぶときは、作った組を使い回す（状態は書き換えないので、状態が同じなら文脈も同じ。
// 出ているボタンごとに、出すか・押せるか・押されているかを問うたびに、文脈を一から作り直さないため）
const calledMade = new WeakMap<Assembled, WeakMap<MatomezuState, Map<string, Called | null>>>()
export function called(defs: Assembled, state: MatomezuState, at: string, id: CommandId | string): Called | null {
  let byState = calledMade.get(defs)
  if (!byState) {
    byState = new WeakMap()
    calledMade.set(defs, byState)
  }
  let made = byState.get(state)
  if (!made) {
    made = new Map()
    byState.set(state, made)
  }
  const key = `${at}\n${id}`
  const found = made.get(key)
  if (found !== undefined) return found
  const c = makeCalled(defs, state, at, id)
  made.set(key, c)
  return c
}

function makeCalled(defs: Assembled, state: MatomezuState, at: string, id: CommandId | string): Called | null {
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
// answers は、同じ組・同じ引数で解いた答えを、出すかと押せるかで使い回す覚え（アクション → 答え）
function performable(c: Called, arg?: unknown, answers?: Answers): boolean {
  const on = "stage" in c.ctx ? askedIn(c.ctx) : undefined
  const where = whereOf(c, arg)
  return (c.def.performs ?? []).every(
    action => withoutPermissions(answerOf(c, action, on, where, answers)).value === true,
  )
}

// 1 つのボタンを 1 つの状態で問う間の、アクションごとの openedAnswer の答え
type Answers = Map<string, Inspected<boolean>>

// アクション action の openedAnswer（answers があれば、解いた物を覚えて使い回す）
function answerOf(
  c: Called,
  action: string,
  on: ReturnType<typeof askedIn> | undefined,
  where: Where | undefined,
  answers?: Answers,
): Inspected<boolean> {
  const was = answers?.get(action)
  if (was) return was
  const made = openedAnswer(c.ctx.catalog, action, on, where, c.ctx)
  answers?.set(action, made)
  return made
}

// 使えるかを問う所: コマンドの許可スコープの所。書いていない・引数がまだ無くて分からないなら、開いているページ（ページのタイプで決まるアクションを、ブック全体として問わないように）
function whereOf(c: Called, arg?: unknown): Where | undefined {
  if (!("stage" in c.ctx)) return undefined
  const page = shownPageId(c.ctx.stage.opened)
  return commandScopeOf(c.def.permissionScope, c.ctx, arg) ?? (page === NO_PAGE ? undefined : { page })
}

// 呼ぶ引数: 押す前から分かっていれば、その 1 つ（undefined も分かっている値）。分からなければ空
type Given = readonly [] | readonly [arg: unknown]

// 定義 def の accepts を、分かっている引数で呼ぶ（引数が分からないか、accepts が無ければ、受け付ける）
const accepted = (c: Called, given: Given): boolean =>
  given.length === 0 ||
  ((c.def.accepts as ((ctx: ScreenCommandContext, args: unknown) => boolean) | undefined)?.(c.ctx, given[0]) ?? true)

// 出すか: 行うアクションが使え、when が出すとし、分かっている引数を accepts が受け付けるとき（given は、押す前から分かっている引数）
export function isShown(defs: Assembled, state: MatomezuState, at: string, id: CommandId, ...given: Given): boolean {
  const c = called(defs, state, at, id)
  return c !== null && performable(c, given[0]) && ask(c, "when") === true && accepted(c, given)
}

// 行うアクションのどれかを、認可ステップと印刷プレビューの間のステージ（stageBlocks）が止めないか（行うアクションが無ければ止められない。denied: "runs" のコマンドは認可ステップを見ない）。
// ブック・ページ・アノテーションが対象のアクションは、今のブックの許可スコープの所で問う。
// 許可スコープを書いたコマンドが行う、一覧が対象のアクション（戻す・やり直すの置き直しなど）は、開いているブック（ブックの外のページを開いていれば、そのページ）のその所を変える物として扱う
// スクリーンから呼ぶコマンドが行うアクションと引数を名乗れば（performsWith）、その引数で行うときと同じに問い、名乗ったどれかが止められれば押せない
function permitted(c: Called, state: MatomezuState, given: Given, answers?: Answers): boolean {
  const arg = given[0]
  const actions = c.def.performs ?? []
  if (actions.length === 0) return true
  if (!("stage" in c.ctx)) {
    const ctx = c.ctx
    const named =
      (given.length === 1 && c.def.from === "screen" && c.def.performsWith?.(ctx, arg as never)) || UNKNOWN_PERFORMED
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
      : answerOf(c, action, on, where, answers)
  const runs = c.def.from !== "screen" && c.def.denied === "runs" // 認可ステップに止められても押せる
  return actions.some(
    action =>
      !stageBlocks(ctx.catalog, ctx.stage.mode, action, onOpened(action) ? "opened-entry" : "target") &&
      (runs || answer(action).value === true),
  )
}

// 行うアクションが使え、そのどれかを認可ステップが止めないか（押せるかのうち、アクションの所だけ）
const allowed = (c: Called, state: MatomezuState, given: Given): boolean =>
  performable(c, given[0]) && permitted(c, state, given)

// 押せるか: 出していて、行うアクションのどれかを認可ステップが止めず、enabled が押せるとするとき
export function isEnabled(defs: Assembled, state: MatomezuState, at: string, id: CommandId, ...given: Given): boolean {
  const c = called(defs, state, at, id)
  return (
    c !== null &&
    ask(c, "when") === true &&
    accepted(c, given) &&
    allowed(c, state, given) &&
    (ask(c, "enabled") ?? true)
  )
}

// 行うアクションを、開いているページのタイプなどの許可スコープの所で使えるか（認可ステップは見ない）
export function isPerformable(defs: Assembled, state: MatomezuState, at: string, id: CommandId): boolean {
  const c = called(defs, state, at, id)
  return c !== null && performable(c)
}

// 行うアクションの所では押せるか（when・accepts・enabled は見ない）。押す前の状態を作るボタン（置こうとするボタンなど）が、その先のコマンドを押せる所かを問う
export function isPermitted(defs: Assembled, state: MatomezuState, at: string, id: CommandId): boolean {
  const c = called(defs, state, at, id)
  return c !== null && allowed(c, state, [])
}

export function isActive(defs: Assembled, state: MatomezuState, at: string, id: CommandId): boolean {
  const c = called(defs, state, at, id)
  return c !== null && (ask(c, "active") ?? false)
}

// 出すか・押せるか・押されているかを 1 度に問った答えの印（isShown・isEnabled・isActive と同じ答え。ボタンが 1 つの値で受け、変わったときだけ描き直す）
export const LOOK_SHOWN = 1
export const LOOK_ENABLED = 2
export const LOOK_ACTIVE = 4

// isShown・isEnabled・isActive を 1 度に問う（when・accepts・アクションの答えを 1 回ずつだけ解く）。答えは LOOK_* の和
export function commandLook(defs: Assembled, state: MatomezuState, at: string, id: CommandId, ...given: Given): number {
  const c = called(defs, state, at, id)
  if (c === null) return 0
  const active = (ask(c, "active") ?? false) ? LOOK_ACTIVE : 0
  if (ask(c, "when") !== true || !accepted(c, given)) return active
  const answers: Answers = new Map()
  if (!performable(c, given[0], answers)) return active
  const enabled = permitted(c, state, given, answers) && (ask(c, "enabled") ?? true)
  return LOOK_SHOWN | (enabled ? LOOK_ENABLED : 0) | active
}
