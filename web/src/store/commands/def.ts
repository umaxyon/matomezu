// コマンドの定義: 画面の入口。ボタン・メニュー・キーなどから id で呼ぶ。
// データを変えるのはアクションで、コマンドは store の操作（ステージ・ダイアログ・アクション）を呼ぶだけ

import type { ActionId, ActionTable, CommandExtras, ContextMenuId, ContextMenuTable, MenuId } from "../../core/catalog"
import type { CoreCatalog } from "../../core/core-catalog"
import type { Where } from "../../core/def/action"
import type { MessageKey } from "../../core/i18n/i18n"
import type { Book } from "../../core/schema/book"
import type { StageView, Workspace } from "../../core/workspace"
import type { OpenedContextMenu } from "../context-menus"
import type { OpenedDialog } from "../dialogs"
import type { Actions, Settings } from "../store"

// コマンドの許可の範囲: "book" はページもアイテムも変えない、"opened-page" は開いているページ、"selection" はその選んでいるアイテム。
// 言葉で言えなければ、呼ばれた場所の様子から所を返す関数
export type CommandScope = "book" | "opened-page" | "selection" | ((ctx: CommandContext) => Where)

// 呼ばれた場所の様子 ctx での、コマンドの許可の範囲の所
export function commandScopeOf(scope: CommandScope | undefined, ctx: CommandContext): Where | undefined {
  if (scope === undefined) return undefined
  if (scope === "book") return {}
  if (typeof scope === "function") return scope(ctx)
  const page = ctx.stage.opened?.page ?? undefined
  const on = page ? { page } : {}
  return scope === "opened-page" ? on : { ...on, items: ctx.stage.selection }
}

// コマンドが受け取る、呼ばれた場所の様子
export interface CommandContext {
  catalog: CoreCatalog
  home: string | null // インスタンスのホームのブックの id
  stage: StageView // 呼ばれた場所のステージ（読むだけ。見た目の useStage と同じ）
  book: Book | null // そのステージで開いているブック
  workspace: Workspace
  settings: Settings
  dialog: OpenedDialog | null // 開いているダイアログ
  contextMenu: OpenedContextMenu | null // 開いている右クリックのメニュー
}

export interface CommandDef<A = undefined, Tt extends string = MessageKey> extends CommandExtras {
  id: string // 本当の id。名前は「対象-動き」（例: stage-split）
  title: Tt
  when(ctx: CommandContext): boolean // 出すか
  enabled?(ctx: CommandContext): boolean // 押せるか。無ければ、出ていれば押せる
  active?(ctx: CommandContext): boolean // 押されている状態か（メニューのボタンの見た目・OS のメニューの印）。無ければ押されていない
  run(ctx: CommandContext, actions: Actions, args: A): void
  // 行うアクション。どれかが今のブック（ブックが対象でなければホームのタイプ）で使えなければ、土台はこのコマンドを出さない。
  // どれも許可の段に止められるなら、土台はこのコマンドを押せなくする（どれか 1 つでも行えれば押せる。設定のダイアログのように、行えるものだけ行うコマンドがある）
  performs?: readonly ActionId[]
  // 許可の範囲: 行うアクションが、呼ばれた場所のブックのどこを変えるか（許可の段に渡す）。ブックが対象のアクションを行うなら必ず書く（defineCommand の型が求める）
  permissionScope?: CommandScope
  // 追加プラグインが入れてほしいメニュー。動いている matomezu の画面が、既定の配置の末尾に足す（placeAdded）。引数と合うかは defineCommand が確かめる
  place?: { menus?: readonly MenuId[]; contextMenus?: readonly ContextMenuId[] }
}

// 入れてほしいメニュー: メニューは引数を取らないコマンドだけ、右クリックのメニューは受け取る物（右クリックされた物）を引数に取れるものだけ
export interface CommandPlace<A> {
  menus?: [A] extends [undefined] ? readonly MenuId[] : never
  contextMenus?: readonly {
    [M in ContextMenuId]: [A] extends [undefined] ? M : ContextMenuTable[M] extends A ? M : never
  }[ContextMenuId][]
}

// 行うアクション P にブックが対象のものがあれば、許可の範囲を必ず書く（defineCommand の型が求める）。表に無いアクション（W003）は数えない
export type CommandScopeRequired<P extends readonly ActionId[] | undefined> = true extends {
  [I in keyof P]: [P[I]] extends [never]
    ? false
    : P[I] extends ActionId
      ? ActionTable[P[I]] extends { target: "book" }
        ? true
        : false
      : false
}[number & keyof P]
  ? { permissionScope: CommandScope }
  : unknown

// run の 3 つ目の引数の型から A を決め、id は書いた文字のまま残す（引数が無ければ A は undefined）。
// 型は書いた順に決まるので、run は when より前に書く（後ろに書くと、引数のあるコマンドが型の誤りになる）
export function defineCommand<
  const Id extends string,
  A = undefined,
  const P extends readonly ActionId[] | undefined = undefined,
>(
  def: CommandDef<A> & { id: Id; performs?: P; place?: CommandPlace<NoInfer<A>> } & CommandScopeRequired<P>,
): CommandDef<A> & { id: Id } {
  return def
}
