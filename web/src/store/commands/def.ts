// コマンドの定義: 画面の入口。ボタン・メニュー・キーなどから id で呼ぶ。
// データを変えるのはアクションで、コマンドは store の操作（ステージ・ダイアログ・アクション）を呼ぶだけ

import type { Annotation } from "../../core/annotation"
import type { ActionId, ActionTable, CommandExtras, ContextMenuId, ContextMenuTable, MenuId } from "../../core/catalog"
import type { CoreCatalog } from "../../core/core-catalog"
import { ANY_PAGE_TYPE, type ArgsOfType, type Where } from "../../core/def/action"
import type { PluginStateDef, PluginStateRead } from "../../core/def/plugin-state"
import { fail } from "../../core/errors"
import type { Folders } from "../../core/folders"
import type { UnreadableItem } from "../../core/folders-unreadable"
import type { Point } from "../../core/geom"
import type { History } from "../../core/history"
import type { MessageKey } from "../../core/i18n/i18n"
import type { Books } from "../../core/library"
import type { ArgsOf } from "../../core/perform"
import type { ItemPage } from "../../core/placed"
import type { Book } from "../../core/schema/book"
import type { Settings } from "../../core/settings"
import { type Stage, shownPageId, toPaper } from "../../core/stage"
import type { StageListed } from "../../core/window"
import type { StageView, Workspace } from "../../core/workspace"
import type { Actions, BoundPlaceActions, ProbeActions, WindowActions } from "../actions"
import type { OpenedContextMenu } from "../context-menus"
import type { OpenedDialog } from "../dialogs"

// コマンドの許可スコープ: "book" はページもアイテムも変えない、"opened-page" は開いているページ、"selection" はその選んでいる物（形の中身やページのフィールドの中の物も含む）。
// { page } には、ページの id が入っている引数の名前を書く（右クリックしたページのように、引数が所を決めるとき）。
// { entry } にはエントリ（ページかバインダ）の id、{ creates } には作るページのタイプの id が入っている引数の名前を書く（アクションの許可スコープと同じ）。
// 言葉で言えなければ、呼ばれた場所の様子と引数（まだ無ければ undefined）から所を返す関数
export type CommandScope<A = unknown> =
  | "book"
  | "opened-page"
  | "selection"
  | { page: ArgsOfType<A, string> }
  | { entry: ArgsOfType<A, string> }
  | { creates: ArgsOfType<A, string> }
  | ((ctx: CommandContext, args: A | undefined) => Where)

// 表に並べたコマンドの許可スコープ（引数の形を問わない形。書くときの型は CommandScope<A>）
export type AnyCommandScope =
  | "book"
  | "opened-page"
  | "selection"
  | { page: string }
  | { entry: string }
  | { creates: string }
  | ((ctx: CommandContext, args: never) => Where)

// 呼ばれた場所の様子 ctx と引数 args（まだ無ければ undefined）での、コマンドの許可スコープの所
export function commandScopeOf(
  scope: AnyCommandScope | undefined,
  ctx: CommandContext,
  args?: unknown,
): Where | undefined {
  if (scope === undefined) return undefined
  if (scope === "book") return {}
  if (typeof scope === "function") return scope(ctx, args as never)
  if (typeof scope === "object" && ("entry" in scope || "creates" in scope)) {
    const key = "entry" in scope ? scope.entry : scope.creates
    const value = typeof args === "object" && args !== null ? (args as Record<string, unknown>)[key] : undefined
    // 作るタイプがまだ無ければ、どれかのタイプを作るとして問う（エントリがまだ無ければ、分からない）
    if ("creates" in scope) return { creates: typeof value === "string" ? value : ANY_PAGE_TYPE }
    return typeof value === "string" ? { entries: [value] } : undefined
  }
  if (typeof scope === "object") {
    const page = typeof args === "object" && args !== null ? (args as Record<string, unknown>)[scope.page] : undefined
    // 引数がまだ無ければ、所は分からない（問う側が、開いているページで問う）
    return typeof page === "string" ? { page } : undefined
  }
  const page = shownPageId(ctx.stage.opened) ?? undefined
  const on = page ? { page } : {}
  return scope === "opened-page" ? on : { ...on, ids: ctx.stage.selection }
}

// 呼ばれた場所のスクリーン（コマンドの文脈が持つ形。ほかのスクリーンを名指さないよう、id は持たない）
export interface CalledScreen {
  def: string // スクリーンの定義の id
  props: unknown // 開くときに渡された値
  stages: boolean // ステージを並べるスクリーンか
}

// スクリーンから呼ぶコマンド（defineScreenCommand）が受け取る、呼ばれた場所の様子。ステージを持たないスクリーンからも呼べるように、ステージ・ブックを持たない
export interface ScreenCommandContext {
  catalog: CoreCatalog
  controlCenter: string | null // インスタンスのコントロールセンターの定義の id
  screen: CalledScreen // 呼ばれた場所のスクリーン（スクリーンの外から呼ばれたら、カレントスクリーン）
  arrangement: { id: string } // 窓のスクリーンアレンジメントの定義の id（値は並べるスクリーンを名指すので持たない）
  settings: Settings
  dialog: OpenedDialog | null // 開いているダイアログ
  contextMenu: OpenedContextMenu | null // 開いている右クリックのメニュー
  libraryHistory: History // 書庫の履歴
  folders: Folders // 書庫のフォルダの表（書庫ホーム・ゴミ箱・フォルダ・ブック・バインダの行と並び。読むだけ。ページの中身は持たない）
  pageTitle(page: string): string | undefined // ページ page の名前（名前の無いページ・表に無い物は undefined。ページの中身は渡さない）
  // コマンドを持つプラグインが宣言したプラグイン状態 def の今の値（スクリーンごとの宣言は呼ばれた場所のスクリーンの値、ステージごとの宣言は呼ばれた場所のステージの値。
  // 無ければ undefined。ほかのプラグインの宣言は E125。変えるのは run が受け取る updatePluginState）
  pluginState: PluginStateRead
}

// CommandContext の book の、開いている物がブックでないとき（何も開いていないか、ブックの外のページ）の値
export const NO_BOOK = "none"
// CommandContext の page の、ページを開いていないときの値
export const NO_PAGE = "none"

// ステージから呼ぶコマンド（defineCommand）が受け取る、呼ばれた場所の様子
export interface CommandContext extends ScreenCommandContext {
  stage: StageView // 呼ばれた場所のステージ（読むだけ。見た目の useStage と同じ）
  book: Book | typeof NO_BOOK // そのステージで開いているブック（開いている物がブックでなければ NO_BOOK）
  page: ItemPage | typeof NO_PAGE // そのステージで開いているページ（ブックの中でも外でも。ページを開いていなければ NO_PAGE）
  bookHistory: History // そのステージで開いているブックの、画面の履歴（ブックが無ければ空）
  annotations: readonly Annotation[] // 開いているページのアノテーション（読むだけ。ページを開いていなければ空）
  toPaper(p: Point): Point | null // 表示領域の中の点（左上から）を、そのステージの今の紙の上の点に直す（紙が無ければ null）
}

// 開いているスクリーン 1 枚（id 付き。base のコマンドが screensOf で読む）
export interface OpenScreen extends CalledScreen {
  id: string // 開いた 1 枚ごとの id
  stageList: readonly StageListed[] // ステージの並び（左から。何かを開いているか付き。ステージを並べないスクリーンなら空）
  currentStage: string | null // カレントのステージの id（ステージを並べないスクリーンなら null）
}

// スクリーンから呼ぶコマンドの文脈ごとの、ほかのスクリーンを名指す物（呼ばれた場所のスクリーンの id・開いているスクリーンをカレントにした順に並べた物（最後がカレントスクリーン）・
// スクリーンアレンジメントの値）。プラグイン API の文脈のフィールドにはしない。base のコマンドが screensOf・arrangementValueIn で読む
export interface ScreenFrame {
  here: string
  screens: readonly OpenScreen[]
  arrangementValue: unknown
}
const frames = new WeakMap<ScreenCommandContext, ScreenFrame>()

// ctx に、ほかのスクリーンを名指す物 frame を結ぶ（ctx を返す）
export function withScreenFrame<C extends ScreenCommandContext>(ctx: C, frame: ScreenFrame): C {
  frames.set(ctx, frame)
  return ctx
}

// コマンドの文脈 ctx の、開いているスクリーンをカレントにした順に並べた物（最後がカレントスクリーン。withScreenFrame を通した文脈だけが持つ）
export const screensOf = (ctx: ScreenCommandContext): readonly OpenScreen[] => frames.get(ctx)?.screens ?? []

// コマンドの文脈 ctx の、スクリーンアレンジメントの値
export const arrangementValueIn = (ctx: ScreenCommandContext): unknown => frames.get(ctx)?.arrangementValue

// コマンドの文脈 ctx の、呼ばれた場所のスクリーンの id（store が、スクリーンごとのプラグイン状態の置き場に使う）
export const calledScreenIdOf = (ctx: ScreenCommandContext): string => frames.get(ctx)?.here ?? fail("E116")

// コマンドの文脈ごとの、読めない物のフォルダの直下の物（書庫の表 folders に入らず、プラグイン API にも出さない。base の書庫のコマンドが unreadableItemsIn で読む）
const unreadableItems = new WeakMap<ScreenCommandContext, readonly UnreadableItem[]>()

// ctx に、読めない物のフォルダの直下の物 items を結ぶ（ctx を返す）
export function withUnreadableItems<C extends ScreenCommandContext>(ctx: C, items: readonly UnreadableItem[]): C {
  unreadableItems.set(ctx, items)
  return ctx
}

// コマンドの文脈 ctx の、読めない物のフォルダの直下の物（並びの順。withUnreadableItems を通した文脈だけが持つ）
export const unreadableItemsIn = (ctx: ScreenCommandContext): readonly UnreadableItem[] =>
  unreadableItems.get(ctx) ?? NO_UNREADABLE_ITEMS
const NO_UNREADABLE_ITEMS: readonly UnreadableItem[] = []

// コマンドの文脈ごとの、ステージの並びと道具（表示領域の大きさ・道具のアイコンなども持つので、プラグイン API の文脈のフィールドにはしない。base のコマンドが workspaceOf で読む）と、
// 開けるブックの一覧（base のコマンドが booksOf で読む）。
// これを読む workspaceOf・booksOf・calledStageOf は、使うのが base だけでも土台に置く（store の外に出さない workspaces を読むので、base からは書けない）
const workspaces = new WeakMap<CommandContext, { workspace: Workspace; stage: string; books: Books }>()

// ctx に、ステージの並び workspace から紙の上の点を求める toPaper を足した、コマンドの文脈（books は、開けるブックの一覧）
export function withWorkspace(
  ctx: Omit<CommandContext, "toPaper">,
  workspace: Workspace,
  stageId: string,
  books: Books,
): CommandContext {
  const full: CommandContext = {
    ...ctx,
    toPaper: p => {
      const stage = workspace.stages.find(s => s.id === stageId)
      return stage ? toPaper(stage, p) : null
    },
  }
  workspaces.set(full, { workspace, stage: stageId, books })
  return full
}

// コマンドの文脈 ctx の、ステージの並びと道具（withWorkspace が作った文脈だけが持つ。写した文脈は持たない）
export const workspaceOf = (ctx: CommandContext): Workspace => workspaces.get(ctx)?.workspace ?? fail("E116")

// コマンドの文脈 ctx の、開けるブックの一覧（プラグイン API の文脈には出さない。base のコマンドが、開いていないブックの名前を読む）
export const booksOf = (ctx: CommandContext): Books => workspaces.get(ctx)?.books ?? {}

// コマンドの文脈 ctx の、呼ばれたステージの中の状態（表示領域の大きさ・ずらす量など。プラグイン API の文脈には出さない。base のコマンドが読む）
export function calledStageOf(ctx: CommandContext): Stage | undefined {
  const held = workspaces.get(ctx)
  return held?.workspace.stages.find(s => s.id === held.stage)
}

// コマンドが受け取る store の操作: 窓の操作と、呼ばれた場所（ステージから呼ぶコマンドはそのステージ、スクリーンから呼ぶコマンドはそのスクリーン）に向けた操作に、
// そのコマンドを持つプラグインのプラグイン状態を変える操作を足したもの
export interface CommandActions extends WindowActions, BoundPlaceActions {
  // このコマンドを持つプラグインが宣言したプラグイン状態 def の値を、今の値から change が返す値にする（undefined なら消す。ステージごとの宣言は呼ばれた場所のステージの値）。1 回のコマンドで何度書いても、store には 1 回で書く。画面の場所に入れる宣言の形に合わなければ E123
  updatePluginState<S>(def: PluginStateDef<S>, change: (now: S | undefined) => S | undefined): void
}

// コマンドに渡した操作ごとの、store の素の操作（ほかのスクリーン・ステージを名指す操作も持つ。プラグイン API には出さない。base のコマンドが storeActionsOf で読む）
export const givenActions = new WeakMap<CommandActions, Actions>()

// コマンドが受け取った操作 a の、store の素の操作（store がコマンドに渡した操作だけが持つ）
export const storeActionsOf = (a: CommandActions): Actions => givenActions.get(a) ?? fail("E116")

// コマンドを持つプラグインの、スクリーンごとの宣言 def の値を、呼ばれた場所でないスクリーン screen で、今の値から change が返す値にする（updatePluginState と同じく、1 回のコマンドの書き込みにまとめる）。スクリーンごとの宣言でなければ E124
export type UpdatePluginStateAt = <S>(
  screen: string,
  def: PluginStateDef<S>,
  change: (now: S | undefined) => S | undefined,
) => void
// コマンドに渡した操作ごとの、ほかのスクリーンの自分の宣言の値を変える操作（プラグイン API には出さない。base のコマンドが updatePluginStateAtOf で読む）
export const givenScreenWrites = new WeakMap<CommandActions, UpdatePluginStateAt>()

// コマンドが受け取った操作 a の、ほかのスクリーンの自分の宣言の値を変える操作（store がコマンドに渡した操作だけが持つ）
export const updatePluginStateAtOf = (a: CommandActions): UpdatePluginStateAt =>
  givenScreenWrites.get(a) ?? fail("E116")

// コマンドが受け取った操作 a の、アクションを行わずに確かめる操作（store がコマンドに渡した操作だけが持つ。プラグイン API には出さない）
export const tryPerformOf = (a: CommandActions): ProbeActions["tryPerform"] => storeActionsOf(a).tryPerform

// コマンドの定義の、呼ぶ場所によらない所
interface CommandDefBase<A, Tt extends string> extends CommandExtras {
  id: string // 本当の id。名前は「対象-動き」（例: stage-split）
  title: Tt
  // 行うアクション。どれかが、許可スコープの所（ブック・ページ・アノテーションが対象でなければコントロールセンター）で使えなければ、土台はこのコマンドを出さない。
  // どれも認可ステップに止められるなら、土台はこのコマンドを押せなくする（どれか 1 つでも行えれば押せる。設定のダイアログのように、行えるアクションだけを選んで行うコマンドのため）
  performs?: readonly ActionId[]
  // 許可スコープ: 行うアクションが、呼ばれた場所のブックのどこを変えるか（認可ステップに渡す）。ブックかページが対象のアクションを行うなら必ず書く
  permissionScope?: CommandScope<A>
  // 追加プラグインが入れてほしいメニュー。動いている matomezu の画面が、既定の UI マッピングの末尾に足す（placeAdded）。引数と合うかは defineCommand の型（CommandPlace）が確かめる。
  // anchorMenu は、押した物にアンカーがあるときにどの右クリックのメニューにも足す項目（LayoutDef の anchorMenu）
  place?: { menus?: readonly MenuId[]; contextMenus?: readonly ContextMenuId[]; anchorMenu?: boolean }
}

// ステージから呼ぶコマンド（defineCommand）。呼ばれた場所のステージとブックを受け取る
export interface StageCommandDef<A = undefined, Tt extends string = MessageKey> extends CommandDefBase<A, Tt> {
  from?: "stage"
  // "runs" なら、行うアクションが認可ステップに止められても押せる（止められたアクションは perform が断るので、run はそれで何も変えずに終える。
  // 取り消しのように、行えなくても終えられるコマンドのため）。書かなければ、どれも止められると押せない。使えない（出さない）ことと印刷プレビューの間は変えない
  denied?: "runs"
  when(ctx: CommandContext): boolean // 出すか
  enabled?(ctx: CommandContext): boolean // 押せるか。無ければ、出ていれば押せる
  active?(ctx: CommandContext): boolean // 押されている状態か（メニューのボタンの見た目・OS のメニューの印）。無ければ押されていない
  run(ctx: CommandContext, actions: CommandActions, args: A): void
}

// スクリーンから呼ぶコマンド（defineScreenCommand）。ステージを持たないスクリーンからも呼べる（ステージ・ブックは受け取らない。ブック・ページ・アノテーションが対象のアクションは行わない）
export interface ScreenCommandDef<A = undefined, Tt extends string = MessageKey> extends CommandDefBase<A, Tt> {
  from: "screen"
  when(ctx: ScreenCommandContext): boolean
  enabled?(ctx: ScreenCommandContext): boolean
  active?(ctx: ScreenCommandContext): boolean
  run(ctx: ScreenCommandContext, actions: CommandActions, args: A): void
  // 引数 args で押したら行うアクションと、その引数（performs の中の、書庫か利用者の設定が対象の物。何も行わないなら空）。引数がまだ分からないなら "unknown"。
  // 名乗れば、土台は押す前にその引数で問う（書庫が対象のアクションなら、許可スコープが引数から出すブックの認可ステップにも）。名乗ったアクションのどれかが止められれば押せない。
  // 名乗らないか "unknown" なら、コントロールセンターにだけ問う
  performsWith?(ctx: ScreenCommandContext, args: A): readonly PerformedWith[] | typeof UNKNOWN_PERFORMED
}

// スクリーンから呼ぶコマンドが名乗れるアクション: 書庫か利用者の設定が対象のもの（Id の中の。ほかは、引数だけでは問う所が決まらない）
type NamedTarget<Id extends ActionId> = {
  [K in Id]: ActionTable[K] extends { target: "library" | "settings" } ? K : never
}[Id]
// スクリーンから呼ぶコマンドが名乗る、行うアクション 1 つとその引数
export type PerformedWith<Id extends ActionId = ActionId> = {
  [K in NamedTarget<Id>]: { action: K; args: ArgsOf<K> }
}[NamedTarget<Id>]
// performsWith の、引数がまだ分からないときの答え
export const UNKNOWN_PERFORMED = "unknown"

export type CommandDef<A = undefined, Tt extends string = MessageKey> = StageCommandDef<A, Tt> | ScreenCommandDef<A, Tt>

// 入れてほしいメニュー: メニューは引数を取らないコマンドだけ、右クリックのメニューは受け取る物（右クリックされた物）を引数に取れるものだけ
// anchorMenu に置けるのは、引数を取らないものと、押した物のアンカーの id（文字列）を引数に取れるもの
export interface CommandPlace<A> {
  menus?: [A] extends [undefined] ? readonly MenuId[] : never
  anchorMenu?: [A] extends [undefined] ? boolean : string extends A ? boolean : never
  contextMenus?: readonly {
    [M in ContextMenuId]: [A] extends [undefined] ? M : ContextMenuTable[M] extends A ? M : never
  }[ContextMenuId][]
}

// 行うアクション P に、対象が T のものがあるか。表に無いアクション（W003）は数えない
type Performs<P extends readonly ActionId[] | undefined, T extends string> = true extends {
  [I in keyof P]: [P[I]] extends [never]
    ? false
    : P[I] extends ActionId
      ? ActionTable[P[I]] extends { target: T }
        ? true
        : false
      : false
}[number & keyof P]
  ? true
  : false

// 行うアクション P にブックかページが対象のものがあれば、許可スコープを必ず書く（defineCommand の型が求める）。
// ページが対象のものがあれば、"book"（ページもアイテムも変えない）は書けない（どのページかを言わないので）
export type CommandScopeRequired<P extends readonly ActionId[] | undefined, A = unknown> =
  Performs<P, "page"> extends true
    ? { permissionScope: Exclude<CommandScope<A>, "book"> }
    : Performs<P, "book"> extends true
      ? { permissionScope: CommandScope<A> }
      : { permissionScope?: CommandScope<A> }

// スクリーンから呼ぶコマンドが行えるアクションの並び: ブック・ページ・アノテーションが対象のものは書けない（defineScreenCommand の型が求める）
export type ScreenPerforms<P extends readonly ActionId[] | undefined> = {
  readonly [I in keyof P]: P[I] extends ActionId
    ? ActionTable[P[I]] extends { target: "book" | "page" | "annotations" }
      ? never
      : P[I]
    : P[I]
}

// スクリーンから呼ぶコマンドの performsWith が名乗れるのは、performs に書いたアクションのうち、書庫か利用者の設定が対象のものだけ（defineScreenCommand の型が求める）
export type ScreenPerformsWith<P extends readonly ActionId[] | undefined, A> = {
  performsWith?(
    ctx: ScreenCommandContext,
    args: A,
  ): readonly PerformedWith<P extends readonly ActionId[] ? P[number] : never>[] | typeof UNKNOWN_PERFORMED
}

// run の 3 つ目の引数の型から A を決め、id は書いた文字のまま残す（引数が無ければ A は undefined）。
// 型は書いた順に決まるので、run は when より前に書く（後ろに書くと、引数のあるコマンドが型の誤りになる）
export function defineCommand<
  const Id extends string,
  A = undefined,
  const P extends readonly ActionId[] | undefined = undefined,
>(
  def: Omit<StageCommandDef<A>, "permissionScope"> & {
    id: Id
    performs?: P
    place?: CommandPlace<NoInfer<A>>
  } & CommandScopeRequired<P, A>,
): StageCommandDef<A> & { id: Id } {
  return def
}

// スクリーンから呼ぶコマンドを書く（from は付けて返す）。行えるのは、ブック・ページ・アノテーションが対象でないアクションだけ（許可スコープは書かない）
export function defineScreenCommand<
  const Id extends string,
  A = undefined,
  const P extends readonly ActionId[] | undefined = undefined,
>(
  def: Omit<ScreenCommandDef<A>, "permissionScope" | "from" | "performs" | "performsWith"> & {
    id: Id
    performs?: P & ScreenPerforms<P>
    place?: CommandPlace<NoInfer<A>>
  } & ScreenPerformsWith<P, A>,
): ScreenCommandDef<A> & { id: Id } {
  // performsWith が名乗るのは performs の中の物なので、どのアクションでもよい形に広げてよい（P のままでは、型が P を決めずに比べられない）
  return { ...def, from: "screen" } as ScreenCommandDef<A> & { id: Id }
}
