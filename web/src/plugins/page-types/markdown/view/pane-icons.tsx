// ペインの並べ方のコマンドのアイコン（ビューの上の行のボタンと、メニュー）: 並べ方ごとのアイコンは base の物（MARKDOWN_PANE_MODE_ICONS）を、このプラグインのコマンドに当てる
import { MARKDOWN_PANE_MODE_ICONS } from "../../../base/ui"
import { PANE_SHOW_RENDERED, PANE_SHOW_SOURCE, PANE_SPLIT_COLUMN, PANE_SPLIT_ROW } from "../commands"

export const PANE_LAYOUT_ICONS = {
  [PANE_SHOW_SOURCE.id]: MARKDOWN_PANE_MODE_ICONS["source-only"],
  [PANE_SPLIT_ROW.id]: MARKDOWN_PANE_MODE_ICONS["split-row"],
  [PANE_SPLIT_COLUMN.id]: MARKDOWN_PANE_MODE_ICONS["split-column"],
  [PANE_SHOW_RENDERED.id]: MARKDOWN_PANE_MODE_ICONS["rendered-only"],
}
