// 開発者が自分のアプリに作るプラグインの見本: hoge のダイアログと、それを開くコマンドと、その既定のキー（React なし）
import { defineCommand, defineDialog, defineKeys, definePlugin } from "matomezu"
import { HOGE_MESSAGES } from "./messages"

export const HOGE_DIALOG = defineDialog({ id: "hoge/dialog" })

// ビルトインプラグインのコマンド（stage.split）も、書き足した型のまま呼べる
export const HOGE_OPEN = defineCommand({
  id: "hoge/open",
  title: "Open hoge",
  run: (ctx, a) => {
    a.command(ctx.stage.id, "stage.split")
    a.openDialog(ctx.stage.id, "hoge/dialog")
  },
  place: { menus: ["stage.menu"] },
  when: () => true,
})

// 引数のあるコマンド
export const HOGE_GREET = defineCommand({
  id: "hoge/greet",
  title: "hoge language",
  run: (ctx, a, lang: "ja" | "en") => {
    a.command(ctx.stage.id, "settings.lang", lang)
  },
  when: () => true,
})

// 既定のキー。結べるのは自分のコマンドだけで、引数のあるコマンドには args に決まった値を書く。
// ビルトインプラグインのキーとぶつかれば使われず（利用者が自分で割り当てる）、どう決まったかは store/keys.ts の inspectKey で分かる
export const HOGE_KEYS = defineKeys([
  { key: "Mod+Shift+H", command: "hoge/open", scope: "stage" },
  { key: "Mod+Shift+J", command: "hoge/greet", scope: "global", args: "ja" },
])

export const HOGE = definePlugin({
  id: "hoge",
  commands: [HOGE_OPEN, HOGE_GREET],
  keys: HOGE_KEYS,
  dialogs: [HOGE_DIALOG],
  messages: HOGE_MESSAGES,
})

// ホストが動的に取り込むときは、default で出したプラグインを受け取る
export default HOGE

declare module "matomezu/catalog" {
  interface MessageTable extends Readonly<typeof HOGE_MESSAGES> {}
  interface CommandTable {
    "hoge/open": typeof HOGE_OPEN
    "hoge/greet": typeof HOGE_GREET
  }
  interface DialogTable {
    "hoge/dialog": typeof HOGE_DIALOG
  }
}
