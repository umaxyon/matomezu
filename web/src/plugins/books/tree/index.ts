// ツリーのプラグイン: ツリーのブックのタイプと、その見せ方・伸びる向きの設定の項目・ページを作るダイアログ。テーマと紙の色の設定の項目と道具の組は、ほかのプラグインの定義を id で選ぶ（tree.ts）
import { defineBuiltin } from "../../../plugin-api/builtin"
import { GROW } from "./grow"
import { kit } from "./kit"
import { NEW_TREE_PAGE_DIALOG, TREE, TREE_PRESENTATION } from "./tree"

export const TREE_PLUGIN = defineBuiltin(
  kit.plugin({
    bookTypes: [TREE],
    presentations: [TREE_PRESENTATION],
    settings: [GROW],
    dialogs: [NEW_TREE_PAGE_DIALOG],
  }),
)

declare module "../../../core/catalog" {
  interface BookTypeTable {
    "@matomezu/tree:tree": typeof TREE
  }
  interface PresentationTable {
    "@matomezu/tree:tree": typeof TREE_PRESENTATION
  }
  interface SettingTable {
    "@matomezu/tree:grow": typeof GROW
  }
  interface DialogTable {
    "@matomezu/tree:page-new": typeof NEW_TREE_PAGE_DIALOG
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
