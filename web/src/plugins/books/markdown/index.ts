// マークダウンのプラグイン: マークダウンのブックのタイプと、その見せ方（ステージに紙を置かない）・ペインの分割のコマンド。
// テーマと紙の色の設定の項目、新しいページとページの設定のダイアログは base の物を使う
import { defineBuiltin } from "../../../plugin-api/builtin"
import { PANE_SPLIT_COLUMN, PANE_SPLIT_ROW, PANE_UNSPLIT } from "./commands"
import { kit } from "./kit"
import { MARKDOWN, MARKDOWN_PRESENTATION } from "./markdown"

export const MARKDOWN_PLUGIN = defineBuiltin(
  kit.plugin({
    bookTypes: [MARKDOWN],
    presentations: [MARKDOWN_PRESENTATION],
    commands: [PANE_SPLIT_ROW, PANE_SPLIT_COLUMN, PANE_UNSPLIT],
  }),
)

declare module "../../../core/catalog" {
  interface BookTypeTable {
    "@matomezu/markdown:markdown": typeof MARKDOWN
  }
  interface PresentationTable {
    "@matomezu/markdown:markdown": typeof MARKDOWN_PRESENTATION
  }
  interface CommandTable {
    "@matomezu/markdown:pane-split-row": typeof PANE_SPLIT_ROW
    "@matomezu/markdown:pane-split-column": typeof PANE_SPLIT_COLUMN
    "@matomezu/markdown:pane-unsplit": typeof PANE_UNSPLIT
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
