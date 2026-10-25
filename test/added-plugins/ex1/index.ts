// ex1: 自分のブックのタイプを持たず、画面に足すだけの追加プラグイン（React なし）
// コマンド（引数なし・あり・右クリックされたアイテムを受け取る）・置いてほしいメニュー・キーの既定の割り当て・ダイアログ・文言と言語
import { defineCommand, defineDialog, defineDialogWith, defineKeys, defineLanguagePack, definePlugin } from "matomezu"
import { EX1_FRENCH, EX1_MESSAGES } from "./messages"

export const HELLO_DIALOG = defineDialog({ id: "ex1/hello" })
export const INSPECT_DIALOG = defineDialogWith<{ item: string }>()({ id: "ex1/inspect" })

// あいさつのダイアログを開く。ステージのメニューに入れてほしい
export const HELLO = defineCommand({
  id: "ex1/hello",
  title: "Say hello",
  run: (ctx, a) => a.openDialog(ctx.stage.id, "ex1/hello"),
  when: () => true,
  place: { menus: ["stage.menu"] },
})

// 引数のあるコマンド: 言語を変える（ビルトインプラグインのコマンドも型のまま呼べる）
export const SWITCH_LANG = defineCommand({
  id: "ex1/lang",
  title: "Switch language",
  run: (ctx, a, lang: "ja" | "en" | "fr") => {
    a.command(ctx.stage.id, "settings.lang", lang)
  },
  when: () => true,
})

// 右クリックされたアイテムを受け取るコマンド。アイテムの右クリックのメニューに入れてほしい
export const INSPECT = defineCommand({
  id: "ex1/inspect",
  title: "Inspect item",
  run: (ctx, a, target: { item: string }) => a.openDialog(ctx.stage.id, "ex1/inspect", target),
  when: () => true,
  place: { contextMenus: ["item.context"] },
})

// 既定のキー。結べるのは自分のコマンドだけで、引数のあるコマンドには args に決まった値を書く
export const EX1_KEYS = defineKeys([
  { key: "Mod+Shift+H", command: "ex1/hello", scope: "stage" },
  { key: "Mod+Shift+J", command: "ex1/lang", scope: "global", args: "ja" },
])

export const EX1 = definePlugin({
  id: "ex1",
  commands: [HELLO, SWITCH_LANG, INSPECT],
  keys: EX1_KEYS,
  dialogs: [HELLO_DIALOG, INSPECT_DIALOG],
  messages: EX1_MESSAGES,
  languages: [defineLanguagePack(EX1_FRENCH)],
})

export default EX1

declare module "matomezu/catalog" {
  interface MessageTable extends Readonly<typeof EX1_MESSAGES> {}
  interface CommandTable {
    "ex1/hello": typeof HELLO
    "ex1/lang": typeof SWITCH_LANG
    "ex1/inspect": typeof INSPECT
  }
  interface DialogTable {
    "ex1/hello": typeof HELLO_DIALOG
    "ex1/inspect": typeof INSPECT_DIALOG
  }
}
