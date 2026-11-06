// マークダウンのプラグイン: マークダウンのブックのタイプと、その見せ方（ステージに紙を置かない）・ペインの並べ方のコマンド・ソースのペインのキーと Tab キーの設定の項目。
// テーマと紙の色の設定の項目、新しいページとページの設定のダイアログは base の物を使う
import { defineBuiltin } from "../../../plugin-api/builtin"
import { PANE_LAYOUT_COMMANDS, SOURCE_KEYS } from "./commands"
import { kit } from "./kit"
import { MARKDOWN, MARKDOWN_PRESENTATION, SOURCE_KEY_SCOPE } from "./markdown"
import { TAB_KEY } from "./tab-key"

export const MARKDOWN_PLUGIN = defineBuiltin(
  kit.plugin({
    bookTypes: [MARKDOWN],
    presentations: [MARKDOWN_PRESENTATION],
    commands: [...PANE_LAYOUT_COMMANDS],
    keys: SOURCE_KEYS,
    keyScopes: [SOURCE_KEY_SCOPE],
    userSettings: [TAB_KEY],
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
    "@matomezu/markdown:pane-show-source": (typeof PANE_LAYOUT_COMMANDS)[0]
    "@matomezu/markdown:pane-split-row": (typeof PANE_LAYOUT_COMMANDS)[1]
    "@matomezu/markdown:pane-split-column": (typeof PANE_LAYOUT_COMMANDS)[2]
    "@matomezu/markdown:pane-show-rendered": (typeof PANE_LAYOUT_COMMANDS)[3]
  }
  interface UserSettingTable {
    "@matomezu/markdown:tab-key": typeof TAB_KEY
  }
  interface KeyScopeTable {
    "@matomezu/markdown:source": typeof SOURCE_KEY_SCOPE // ソースのペインのテキストFormの中のキー
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
