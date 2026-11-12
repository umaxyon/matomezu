// コマンドの定義: 画面の入口。ボタン・メニュー・キーなどから id で呼ぶ。
// データを変えるのはアクションで、コマンドは store の操作（ステージ・ダイアログ・アクション）を呼ぶだけ

import type { ActionId, ActionTable, CommandExtras, ContextMenuId, ContextMenuTable, MenuId } from "../../core/catalog"
import type { CoreCatalog } from "../../core/core-catalog"
import type { ArgsOfType, Where } from "../../core/def/action"
import type { PlacedStateDef } from "../../core/def/placed-state"
import { fail } from "../../core/errors"
import type { Point } from "../../core/geom"
import type { BookHistory } from "../../core/history"
import type { MessageKey } from "../../core/i18n/i18n"
import type { Book } from "../../core/schema/book"
import { toPaper } from "../../core/stage"
import type { Front } from "../../core/window"
import type { StageView, Workspace } from "../../core/workspace"
import type { OpenedContextMenu } from "../context-menus"
import type { OpenedDialog } from "../dialogs"
import type { Actions, Settings } from "../store"

// コマンドの許可スコープ: "book" はページもアイテムも変えない、"opened-page" は開いているページ、"selection" はその選んでいる物（形の中身やページのフィールドの中の物も含む）。
// { page } には、ページの id が入っている引数の名前を書く（右クリックしたページのように、引数が所を決めるとき）。
// 言葉で言えなければ、呼ばれた場所の様子と引数（まだ無ければ undefined）から所を返す関数
export type CommandScope<A = unknown> =
  | "book"
  | "opened-page"
  | "selection"
  | { page: ArgsOfType<A, string> }
  | ((ctx: CommandContext, args: A | undefined) => Where)

// 表に並べたコマンドの許可スコープ（引数の形を問わない形。書くときの型は CommandScope<A>）
export type AnyCommandScope =
  | "book"
  | "opened-page"
  | "selection"
  | { page: string }
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
  if (typeof scope === "object") {
    const page = typeof args === "object" && args !== null ? (args as Record<string, unknown>)[scope.page] : undefined
    return typeof page === "string" ? { page } : {}
  }
  const page = ctx.stage.opened?.page ?? undefined
  const on = page ? { page } : {}
  return scope === "opened-page" ? on : { ...on, ids: ctx.stage.selection }
}

// コマンドが受け取る、呼ばれた場所の様子
export interface CommandContext {
  catalog: CoreCatalog
  controlCenter: string | null // インスタンスのコントロールセンターの定義の id
  front: Front // 窓が前に出している物（呼ばれた場所のステージは、前に出せるブックスクリーンのもの）
  stage: StageView // 呼ばれた場所のステージ（読むだけ。見た目の useStage と同じ）
  book: Book | null // そのステージで開いているブック
  settings: Settings
  dialog: OpenedDialog | null // 開いているダイアログ
  contextMenu: OpenedContextMenu | null // 開いている右クリックのメニュー
  bookHistory: BookHistory // そのステージで開いているブックの、画面の履歴（ブックが無ければ空）
  toPaper(p: Point): Point | null // 表示領域の中の点（左上から）を、そのステージの今の紙の上の点に直す（紙が無ければ null）
  stageState: unknown // コマンドを持つプラグイン（id の頭）が持つ、そのステージの画面の状態（無ければ undefined。変えるのは run が受け取る updateStageState）
  frameState: unknown // コマンドを持つプラグインが持つ、窓の外観枠の状態（無ければ undefined。変えるのは run が受け取る updateFrameState）
  // コマンドを持つプラグインが宣言した、場所に入れる画面の状態 def の値（ステージの宣言は呼ばれた場所のステージの値。無ければ undefined。ほかのプラグインの宣言は E125。変えるのは run が受け取る updatePlaced）
  placed<S>(def: PlacedStateDef<S>): S | undefined
}

// コマンドの文脈ごとの、ステージの並びと道具（表示領域の大きさ・道具のアイコンなども持つので、プラグイン API の文脈のフィールドにはしない。base のコマンドが workspaceOf で読む）
const workspaces = new WeakMap<CommandContext, Workspace>()

// ctx に、ステージの並び workspace から紙の上の点を求める toPaper を足した、コマンドの文脈
export function withWorkspace(ctx: Omit<CommandContext, "toPaper">, workspace: Workspace): CommandContext {
  const full: CommandContext = {
    ...ctx,
    toPaper: p => {
      const stage = workspace.stages.find(s => s.id === ctx.stage.id)
      return stage ? toPaper(stage, p) : null
    },
  }
  workspaces.set(full, workspace)
  return full
}

// コマンドの文脈 ctx の、ステージの並びと道具（withWorkspace が作った文脈だけが持つ。写した文脈は持たない）
export const workspaceOf = (ctx: CommandContext): Workspace => workspaces.get(ctx) ?? fail("E116", { id: ctx.stage.id })

// コマンドが受け取る store の操作: 画面の操作（Actions）に、そのコマンドを持つプラグインの、ステージの画面の状態を変える操作を足したもの
export interface CommandActions extends Actions {
  // 呼ばれた場所のステージの、このコマンドを持つプラグインの画面の状態を、今の値から change が返す値にする（undefined なら消す）。ほかのステージ・プラグインの状態は変えられない
  updateStageState(change: (now: unknown) => unknown): void
  // このコマンドを持つプラグインの、窓の外観枠の状態を、今の値から change が返す値にする（undefined なら消す）。ほかのプラグインの状態は変えられない
  updateFrameState(change: (now: unknown) => unknown): void
  // このコマンドを持つプラグインが宣言した、場所に入れる画面の状態 def の値を、今の値から change が返す値にする（undefined なら消す。ステージの宣言は呼ばれた場所のステージの値）。形に合わなければ E123
  updatePlaced<S>(def: PlacedStateDef<S>, change: (now: S | undefined) => S | undefined): void
}

export interface CommandDef<A = undefined, Tt extends string = MessageKey> extends CommandExtras {
  id: string // 本当の id。名前は「対象-動き」（例: stage-split）
  title: Tt
  when(ctx: CommandContext): boolean // 出すか
  enabled?(ctx: CommandContext): boolean // 押せるか。無ければ、出ていれば押せる
  active?(ctx: CommandContext): boolean // 押されている状態か（メニューのボタンの見た目・OS のメニューの印）。無ければ押されていない
  run(ctx: CommandContext, actions: CommandActions, args: A): void
  // 行うアクション。どれかが今のブック（ブックが対象でなければコントロールセンター）で使えなければ、土台はこのコマンドを出さない。
  // どれも認可ステップに止められるなら、土台はこのコマンドを押せなくする（どれか 1 つでも行えれば押せる。設定のダイアログのように、行えるものだけ行うコマンドがある）
  performs?: readonly ActionId[]
  // 許可スコープ: 行うアクションが、呼ばれた場所のブックのどこを変えるか（認可ステップに渡す）。ブックが対象のアクションを行うなら必ず書く（defineCommand の型が求める）
  permissionScope?: CommandScope<A>
  // 追加プラグインが入れてほしいメニュー。動いている matomezu の画面が、既定の UI マッピングの末尾に足す（placeAdded）。引数と合うかは defineCommand が確かめる。
  // anchorMenu は、押した物にアンカーがあるときにどの右クリックのメニューにも足す項目（LayoutDef の anchorMenu）
  place?: { menus?: readonly MenuId[]; contextMenus?: readonly ContextMenuId[]; anchorMenu?: boolean }
}

// 入れてほしいメニュー: メニューは引数を取らないコマンドだけ、右クリックのメニューは受け取る物（右クリックされた物）を引数に取れるものだけ
// anchorMenu に置けるのは、引数を取らないものと、押した物のアンカーの id（文字列）を引数に取れるもの
export interface CommandPlace<A> {
  menus?: [A] extends [undefined] ? readonly MenuId[] : never
  anchorMenu?: [A] extends [undefined] ? boolean : string extends A ? boolean : never
  contextMenus?: readonly {
    [M in ContextMenuId]: [A] extends [undefined] ? M : ContextMenuTable[M] extends A ? M : never
  }[ContextMenuId][]
}

// 行うアクション P にブックが対象のものがあれば、許可スコープを必ず書く（defineCommand の型が求める）。表に無いアクション（W003）は数えない
export type CommandScopeRequired<P extends readonly ActionId[] | undefined, A = unknown> = true extends {
  [I in keyof P]: [P[I]] extends [never]
    ? false
    : P[I] extends ActionId
      ? ActionTable[P[I]] extends { target: "book" }
        ? true
        : false
      : false
}[number & keyof P]
  ? { permissionScope: CommandScope<A> }
  : { permissionScope?: CommandScope<A> }

// run の 3 つ目の引数の型から A を決め、id は書いた文字のまま残す（引数が無ければ A は undefined）。
// 型は書いた順に決まるので、run は when より前に書く（後ろに書くと、引数のあるコマンドが型の誤りになる）
export function defineCommand<
  const Id extends string,
  A = undefined,
  const P extends readonly ActionId[] | undefined = undefined,
>(
  def: Omit<CommandDef<A>, "permissionScope"> & {
    id: Id
    performs?: P
    place?: CommandPlace<NoInfer<A>>
  } & CommandScopeRequired<P, A>,
): CommandDef<A> & { id: Id } {
  return def
}
