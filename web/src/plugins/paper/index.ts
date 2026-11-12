// 紙のプラグイン: 紙の見せ方（ページごとの紙の上に形を置く）と紙の道具の組と、形を置く・動かす・大きさを変える・中身を変える・消すアクションとコマンド、全部を選ぶコマンドとそれらのキー。
// 置ける形とつなぐものは、ブックのタイプが選んだアイテムで、紙はそれを名指さない（アイテムの定義と、そのビューの口で扱う）
import { defineBuiltin } from "../../plugin-api/builtin"
import { kit } from "./kit"
import { PAPER } from "./paper"
import {
  COPY_PASTE_KEYS,
  ITEM_KEYS,
  ITEM_MOVE,
  ITEM_PASTE,
  ITEM_PLACE,
  ITEM_REMOVE,
  ITEM_REPARENT,
  ITEM_RESIZE,
  ITEM_UPDATE,
  PAPER_COPY,
  PAPER_CUT,
  PAPER_DELETE,
  PAPER_DUPLICATE,
  PAPER_EDIT,
  PAPER_MOVE,
  PAPER_PASTE,
  PAPER_PASTE_AT,
  PAPER_PLACE,
  PAPER_REPARENT,
  PAPER_RESIZE,
  PAPER_SELECT_ALL,
} from "./placing"
import { type CLIP_STATE, PAPER_STATES } from "./placing/states"
import { PAPER_TOOLS, REPARENT_TOOL } from "./tools"

export const PAPER_PLUGIN = defineBuiltin(
  kit.plugin({
    presentations: [PAPER],
    pluginStates: PAPER_STATES,
    tools: [REPARENT_TOOL],
    toolSets: [PAPER_TOOLS],
    actions: [ITEM_PLACE, ITEM_PASTE, ITEM_MOVE, ITEM_UPDATE, ITEM_RESIZE, ITEM_REMOVE, ITEM_REPARENT],
    commands: [
      PAPER_PLACE,
      PAPER_COPY,
      PAPER_CUT,
      PAPER_PASTE,
      PAPER_PASTE_AT,
      PAPER_DUPLICATE,
      PAPER_MOVE,
      PAPER_REPARENT,
      PAPER_RESIZE,
      PAPER_EDIT,
      PAPER_DELETE,
      PAPER_SELECT_ALL,
    ],
    keys: [...ITEM_KEYS, ...COPY_PASTE_KEYS],
  }),
)

declare module "../../core/catalog" {
  interface PresentationTable {
    "@matomezu/paper:paper": typeof PAPER
  }
  interface PluginStateTable {
    "@matomezu/paper:clip": typeof CLIP_STATE
  }
  interface ToolTable {
    "@matomezu/paper:reparent": typeof REPARENT_TOOL
  }
  interface ToolSetTable {
    "@matomezu/paper:paper": typeof PAPER_TOOLS
  }
  interface ActionTable {
    "@matomezu/paper:item-place": typeof ITEM_PLACE
    "@matomezu/paper:item-paste": typeof ITEM_PASTE
    "@matomezu/paper:item-move": typeof ITEM_MOVE
    "@matomezu/paper:item-update": typeof ITEM_UPDATE
    "@matomezu/paper:item-resize": typeof ITEM_RESIZE
    "@matomezu/paper:item-remove": typeof ITEM_REMOVE
    "@matomezu/paper:item-reparent": typeof ITEM_REPARENT
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
  interface CommandTable {
    "@matomezu/paper:paper-place": typeof PAPER_PLACE
    "@matomezu/paper:paper-copy": typeof PAPER_COPY
    "@matomezu/paper:paper-cut": typeof PAPER_CUT
    "@matomezu/paper:paper-paste": typeof PAPER_PASTE
    "@matomezu/paper:paper-paste-at": typeof PAPER_PASTE_AT
    "@matomezu/paper:paper-duplicate": typeof PAPER_DUPLICATE
    "@matomezu/paper:paper-move": typeof PAPER_MOVE
    "@matomezu/paper:paper-reparent": typeof PAPER_REPARENT
    "@matomezu/paper:paper-resize": typeof PAPER_RESIZE
    "@matomezu/paper:paper-edit": typeof PAPER_EDIT
    "@matomezu/paper:paper-delete": typeof PAPER_DELETE
    "@matomezu/paper:paper-select-all": typeof PAPER_SELECT_ALL
  }
}
