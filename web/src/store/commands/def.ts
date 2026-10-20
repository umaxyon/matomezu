// コマンドの定義: 画面の入口。ボタン・メニュー・キーなどから id で呼ぶ。
// データを変えるのはアクションで、コマンドは store の操作（ステージ・ダイアログ・アクション）を呼ぶだけ
import type { MessageKey } from "../../core/i18n/i18n"
import type { Registry } from "../../core/registry"
import type { Book } from "../../core/schema/book"
import type { Stage } from "../../core/stage"
import type { Workspace } from "../../core/workspace"
import type { Actions, Settings } from "../store"

// コマンドが受け取る、呼ばれた場所の様子
export interface CommandContext {
  registry: Registry
  home: string | null // app のホームのブックの id
  stage: Stage // 呼ばれた場所のステージ
  book: Book | null // そのステージで開いているブック
  workspace: Workspace
  settings: Settings
}

export interface CommandDef<A = undefined> {
  id: string // 「対象.動き」（例: stage.split）
  title: MessageKey
  when(ctx: CommandContext): boolean // 出すか
  enabled?(ctx: CommandContext): boolean // 押せるか。無ければ、出ていれば押せる
  active?(ctx: CommandContext): boolean // 押されている状態か（メニューのボタンの見た目・OS のメニューの印）。無ければ押されていない
  run(ctx: CommandContext, actions: Actions, args: A): void
}

// run の 3 つ目の引数の型から A を決め、id は書いた文字のまま残す（引数が無ければ A は undefined）。
// 型は書いた順に決まるので、run は when より前に書く（後ろに書くと、引数のあるコマンドが型の誤りになる）
export function defineCommand<const Id extends string, A = undefined>(
  def: CommandDef<A> & { id: Id },
): CommandDef<A> & { id: Id } {
  return def
}
