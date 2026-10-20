// 開発者が自分のアプリに作るプラグインの見本: hoge のダイアログと、それを開くコマンド（React なし）
import { defineCommand } from "../../../../web/src/store/commands/def"
import { defineDialog } from "../../../../web/src/store/dialogs"
import { definePlugin } from "../../../../web/src/store/plugin"
import { HOGE_MESSAGES } from "./messages"

export const HOGE_DIALOG = defineDialog({ id: "hoge/dialog" })

// 中の部品のコマンド（stage.split）も、書き足した型のまま呼べる
export const HOGE_OPEN = defineCommand({
  id: "hoge/open",
  title: "hoge を開く",
  run: (ctx, a) => {
    a.command(ctx.stage.id, "stage.split")
    a.openDialog(ctx.stage.id, "hoge/dialog")
  },
  when: () => true,
})

// 引数のあるコマンド
export const HOGE_GREET = defineCommand({
  id: "hoge/greet",
  title: "hoge の言語",
  run: (ctx, a, lang: "ja" | "en") => {
    a.command(ctx.stage.id, "settings.lang", lang)
  },
  when: () => true,
})

export const HOGE = definePlugin({
  id: "hoge",
  commands: [HOGE_OPEN, HOGE_GREET],
  dialogs: [HOGE_DIALOG],
  messages: HOGE_MESSAGES,
})

declare module "../../../../web/src/core/tables" {
  interface MessageTable extends Readonly<typeof HOGE_MESSAGES> {}
}

declare module "../../../../web/src/store/tables" {
  interface CommandTable {
    "hoge/open": typeof HOGE_OPEN
    "hoge/greet": typeof HOGE_GREET
  }
  interface DialogTable {
    "hoge/dialog": typeof HOGE_DIALOG
  }
}
