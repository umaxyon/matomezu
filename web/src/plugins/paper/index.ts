// 紙のプラグイン: 紙の見せ方（ページごとの紙の上に形を置く）と、形を置く・動かす・大きさを変える・中身を変える・消すアクションとコマンドとそのキー。
// 置ける形とつなぐものは、ブックのタイプが選んだアイテムで、紙はそれを名指さない（アイテムの定義と、そのビューの口で扱う）
import { defineBuiltin } from "../../plugin-api/builtin"
import { kit } from "./kit"
import { PAPER } from "./paper"
import {
  ITEM_KEYS,
  ITEM_MOVE,
  ITEM_PLACE,
  ITEM_REMOVE,
  ITEM_RESIZE,
  ITEM_UPDATE,
  PAPER_DELETE,
  PAPER_EDIT,
  PAPER_MOVE,
  PAPER_PLACE,
  PAPER_RESIZE,
} from "./placing"

export const PAPER_PLUGIN = defineBuiltin(
  kit.plugin({
    presentations: [PAPER],
    actions: [ITEM_PLACE, ITEM_MOVE, ITEM_UPDATE, ITEM_RESIZE, ITEM_REMOVE],
    commands: [PAPER_PLACE, PAPER_MOVE, PAPER_RESIZE, PAPER_EDIT, PAPER_DELETE],
    keys: ITEM_KEYS,
  }),
)

declare module "../../core/catalog" {
  interface PresentationTable {
    "@matomezu/paper:paper": typeof PAPER
  }
  interface ActionTable {
    "@matomezu/paper:item-place": typeof ITEM_PLACE
    "@matomezu/paper:item-move": typeof ITEM_MOVE
    "@matomezu/paper:item-update": typeof ITEM_UPDATE
    "@matomezu/paper:item-resize": typeof ITEM_RESIZE
    "@matomezu/paper:item-remove": typeof ITEM_REMOVE
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
  interface CommandTable {
    "@matomezu/paper:paper-place": typeof PAPER_PLACE
    "@matomezu/paper:paper-move": typeof PAPER_MOVE
    "@matomezu/paper:paper-resize": typeof PAPER_RESIZE
    "@matomezu/paper:paper-edit": typeof PAPER_EDIT
    "@matomezu/paper:paper-delete": typeof PAPER_DELETE
  }
}
