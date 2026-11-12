// マークダウンのプラグイン: マークダウンのブックのタイプと、その見せ方（ステージに紙を置かない）・ペインの並べ方のコマンド（並べ方は画面の場所に入れる）・ソースのペインのキーと、Tab キーとソースのペインの見た目。
// テーマと紙の色の設定の項目、新しいページとページの設定のダイアログは base の物を使う
import { defineBuiltin } from "../../../plugin-api/builtin"
import { PANE_LAYOUT_COMMANDS, SOURCE_KEYS } from "./commands"
import { GITHUB_LIKE } from "./github-like"
import { kit } from "./kit"
import { MARKDOWN, MARKDOWN_PRESENTATION, SOURCE_KEY_SCOPE } from "./markdown"
import { MARKDOWN_STATES, type PANE_LAYOUT_STATE, type PANE_OPENING_STATE } from "./panes"
import { type CURRENT_LINE, type LINE_NUMBERS, type SHOW_WHITESPACE, SOURCE_LOOK_SETTINGS } from "./source-look"
import { TAB_KEY } from "./tab-key"

export const MARKDOWN_PLUGIN = defineBuiltin(
  kit.plugin({
    bookTypes: [MARKDOWN],
    presentations: [MARKDOWN_PRESENTATION],
    commands: [...PANE_LAYOUT_COMMANDS],
    keys: SOURCE_KEYS,
    keyScopes: [SOURCE_KEY_SCOPE],
    userSettings: [TAB_KEY, ...SOURCE_LOOK_SETTINGS],
    themes: [GITHUB_LIKE],
    pluginStates: MARKDOWN_STATES,
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
    "@matomezu/markdown:line-numbers": typeof LINE_NUMBERS
    "@matomezu/markdown:current-line": typeof CURRENT_LINE
    "@matomezu/markdown:show-whitespace": typeof SHOW_WHITESPACE
  }
  interface ThemeTable {
    "@matomezu/markdown:github-like": typeof GITHUB_LIKE
  }
  interface PluginStateTable {
    "@matomezu/markdown:pane-layout": typeof PANE_LAYOUT_STATE
    "@matomezu/markdown:pane-opening": typeof PANE_OPENING_STATE
  }
  interface KeyScopeTable {
    "@matomezu/markdown:source": typeof SOURCE_KEY_SCOPE // ソースのペインのテキストFormの中のキー
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
