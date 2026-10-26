// ex3: ex1・ex2 とは別の作り手の追加プラグイン（React なし）。ほかの見本とは id でだけ関わる。
// ブックのタイプ・形・紙・設定の項目・テーマ・スキンと、開いているブックをミントにするコマンド
import { definePlugin } from "matomezu"
import { BOARD, GRID, MINT, NIGHT, SQUARE, STAR, STAR_ADD_DIALOG, STAR_EDIT_DIALOG } from "./board"
import { kit } from "./kit"

// 開いているブックのテーマをミントにする（ほかの作り手のタイプのブックにも使える）
export const USE_MINT = kit.defineCommand({
  id: "mint",
  performs: ["@matomezu/base:book-update"],
  title: "useMint",
  run: (ctx, a) => {
    if (ctx.book)
      a.perform(
        "@matomezu/base:book-update",
        { settings: { "@matomezu/base:book-theme": MINT.id } },
        { book: ctx.book.id },
      )
  },
  when: ctx => ctx.book !== null && "pages" in ctx.book,
})

export const EX3 = definePlugin(
  kit.plugin({
    bookTypes: [BOARD],
    items: [STAR],
    papers: [SQUARE],
    settings: [GRID],
    themes: [MINT],
    skins: [NIGHT],
    commands: [USE_MINT],
    dialogs: [STAR_ADD_DIALOG, STAR_EDIT_DIALOG],
  }),
)

export default EX3

declare module "matomezu/catalog" {
  interface BookTypeTable {
    "ex3:board": typeof BOARD
  }
  interface ItemTable {
    "ex3:star": typeof STAR
  }
  interface PaperTable {
    "ex3:square": typeof SQUARE
  }
  interface SettingTable {
    "ex3:board-grid": typeof GRID
  }
  interface ThemeTable {
    "ex3:mint": typeof MINT
  }
  interface SkinTable {
    "ex3:night": typeof NIGHT
  }
  interface CommandTable {
    "ex3:mint": typeof USE_MINT
  }
  interface DialogTable {
    "ex3:star-add": typeof STAR_ADD_DIALOG
    "ex3:star-edit": typeof STAR_EDIT_DIALOG
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
