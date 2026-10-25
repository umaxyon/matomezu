// hoge とは別の作り手のプラグインの見本（React なし）: タイプ・形・設定の項目・テーマと、開いているブックをそのテーマにするコマンド
import { defineCommand, definePlugin } from "matomezu"
import { BOARD, BOARD_GRID, MINT, STAR, STAR_ADD_DIALOG, STAR_EDIT_DIALOG } from "./board"
import { FUGA_MESSAGES } from "./messages"

// 開いているブックのテーマを fuga のミントにする（ほかのプラグインのタイプのブックにも、id で選んで使える）
export const FUGA_MINT = defineCommand({
  id: "fuga/mint",
  title: "Use fuga mint",
  run: (ctx, a) => {
    if (ctx.book) a.perform("book.update", { theme: MINT.id }, { book: ctx.book.id })
  },
  when: ctx => ctx.book !== null,
})

export const FUGA = definePlugin({
  id: "fuga",
  bookTypes: [BOARD],
  items: [STAR],
  settings: [BOARD_GRID],
  themes: [MINT],
  commands: [FUGA_MINT],
  dialogs: [STAR_ADD_DIALOG, STAR_EDIT_DIALOG],
  messages: FUGA_MESSAGES,
})

declare module "matomezu/catalog" {
  interface BookTypeTable {
    "fuga/board": typeof BOARD
  }
  interface ItemTable {
    "fuga/star": typeof STAR
  }
  interface SettingTable {
    "fuga/board.grid": typeof BOARD_GRID
  }
  interface ThemeTable {
    "fuga/mint": typeof MINT
  }
  interface CommandTable {
    "fuga/mint": typeof FUGA_MINT
  }
  interface DialogTable {
    "fuga/star.add": typeof STAR_ADD_DIALOG
    "fuga/star.edit": typeof STAR_EDIT_DIALOG
  }
  interface MessageTable extends Readonly<typeof FUGA_MESSAGES> {}
}
