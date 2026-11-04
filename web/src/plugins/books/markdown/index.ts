// マークダウンのプラグイン: マークダウンのブックのタイプと、その見せ方（ステージに紙を置かない）・ペインの分割のコマンド・ソースのペインのキーと Tab キーの設定の項目、描いた文書のテーマキーの値の確かめ。
// テーマと紙の色の設定の項目、新しいページとページの設定のダイアログは base の物を使う
import { defineBuiltin } from "../../../plugin-api/builtin"
import { PANE_SPLIT_COLUMN, PANE_SPLIT_ROW, PANE_UNSPLIT, SOURCE_KEYS } from "./commands"
import { kit } from "./kit"
import { MARKDOWN, MARKDOWN_PRESENTATION } from "./markdown"
import { TAB_KEY } from "./tab-key"
import { MARKDOWN_TOKENS_CHECK } from "./tokens"

export const MARKDOWN_PLUGIN = defineBuiltin(
  kit.plugin({
    bookTypes: [MARKDOWN],
    presentations: [MARKDOWN_PRESENTATION],
    commands: [PANE_SPLIT_ROW, PANE_SPLIT_COLUMN, PANE_UNSPLIT],
    keys: SOURCE_KEYS,
    userSettings: [TAB_KEY],
    checks: [MARKDOWN_TOKENS_CHECK],
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
  interface UserSettingTable {
    "@matomezu/markdown:tab-key": typeof TAB_KEY
  }
  interface KeyScopeTable {
    "@matomezu/markdown:source": true // ソースのペインのテキストFormの中のキー
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
